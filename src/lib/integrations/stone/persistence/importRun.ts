import "server-only";
import { isStoneConfigured } from "@/lib/config/env";
import { dataAvailableThroughDate, fetchNormalizedConciliations } from "@/lib/integrations/stone/multiDay";
import { datesBetween, reconcileStoneWithJumpparkForPeriod } from "@/lib/integrations/stone/jumpparkReconciliationService";
import { buildNormalizedTransactionRecords, hashNormalizedConciliation } from "@/lib/integrations/stone/persistence/mapping";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import { buildDivergenceNaturalKey, buildReconciliationNaturalKey, type StoneDivergenceRecord, type StoneReconciliationResultRecord } from "@/lib/integrations/stone/persistence/types";
import type { StoneFinancialEvent } from "@/lib/integrations/stone/types";

/**
 * Missão V6.2 (Fase 6) — soma os eventos de conta "PrepaymentFee" (tipo 20, a taxa real de
 * antecipação daquele dia) e "PrepaymentDisbursement" (tipo 17, o principal antecipado,
 * informativo) — `null` quando o dia não teve nenhum evento do tipo (nunca 0 fabricado, mesmo
 * princípio de "ausência de dado ≠ zero" já usado no resto do projeto).
 */
export function sumPrepaymentEvents(events: StoneFinancialEvent[]): { prepaymentFeeAmount: number | null; prepaymentDisbursementAmount: number | null } {
  const fees = events.filter((e) => e.type === 20);
  const disbursements = events.filter((e) => e.type === 17);
  return {
    prepaymentFeeAmount: fees.length > 0 ? Math.round(fees.reduce((sum, e) => sum + e.amount, 0) * 100) / 100 : null,
    prepaymentDisbursementAmount: disbursements.length > 0 ? Math.round(disbursements.reduce((sum, e) => sum + e.amount, 0) * 100) / 100 : null,
  };
}

/**
 * Pipeline real de importação e conciliação (Sprint 7.0, Z4) — único ponto que liga "buscar da
 * Stone" a "persistir". Ordem (seção 7 da decisão do usuário): iniciar importRun → obter arquivo
 * → normalizar → persistir → calcular Agenda Financeira/conciliação → gerar/persistir
 * divergências → concluir. A Agenda Financeira em si nunca é persistida (continua um cálculo puro
 * sob demanda, Z3, seção 9.1 do documento de arquitetura) — só os fatos que a alimentam
 * (`stone_normalized_transactions`) e os resultados de conciliação/divergências são.
 *
 * Cada dia é uma execução de importação independente (`stone_import_runs`, idempotente por
 * `referenceDate`+`layout` via `onConflictDoUpdate`) — uma falha isolada num dia nunca impede os
 * demais nem deixa dado parcial incoerente (o upsert de transações só acontece depois que o dia
 * inteiro foi buscado e normalizado com sucesso).
 */

export interface SyncStonePeriodInput {
  fromDate: string;
  toDate: string;
  origin: string;
}

export interface DayImportOutcome {
  referenceDate: string;
  status: "succeeded" | "failed";
  recordCount: number | null;
  error: string | null;
}

export type SyncStonePeriodStatus = "ok" | "not_configured" | "no_data" | "partial";

export interface SyncStonePeriodResult {
  status: SyncStonePeriodStatus;
  days: DayImportOutcome[];
  transactionsPersisted: number;
  reconciliationResultsPersisted: number;
  divergencesPersisted: number;
  dataAvailableThroughDate: string | null;
  limitations: string[];
}

/**
 * Busca, normaliza e persiste o período solicitado (uma `stone_import_runs` por dia), depois
 * calcula e persiste conciliação Stone×JumpPark e divergências para o mesmo período. Nunca lança
 * — todo erro vira um `DayImportOutcome` honesto; uma falha isolada nunca interrompe os demais
 * dias nem a etapa de conciliação.
 */
export async function syncStonePeriod(input: SyncStonePeriodInput): Promise<SyncStonePeriodResult> {
  if (!isStoneConfigured()) {
    return { status: "not_configured", days: [], transactionsPersisted: 0, reconciliationResultsPersisted: 0, divergencesPersisted: 0, dataAvailableThroughDate: null, limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes."] };
  }

  const repo = getStonePersistenceRepository();
  const dates = datesBetween(input.fromDate, input.toDate);
  const dayResults = await fetchNormalizedConciliations(dates);
  const availableThrough = dataAvailableThroughDate(dayResults);

  const days: DayImportOutcome[] = [];
  let transactionsPersisted = 0;

  for (const dayResult of dayResults) {
    const run = await repo.startImportRun({
      referenceDate: dayResult.referenceDate,
      layout: "XML2_4",
      requestedPeriodFrom: input.fromDate,
      requestedPeriodTo: input.toDate,
      origin: input.origin,
    });

    if (dayResult.status === "ok" && dayResult.normalized) {
      const records = buildNormalizedTransactionRecords(dayResult.normalized, availableThrough ?? dayResult.referenceDate, run.id);
      await repo.upsertNormalizedTransactions(records);
      transactionsPersisted += records.length;
      const { prepaymentFeeAmount, prepaymentDisbursementAmount } = sumPrepaymentEvents(dayResult.normalized.financialEvents);
      await repo.finishImportRun({
        id: run.id,
        status: "succeeded",
        recordCount: records.length,
        errorSanitized: null,
        failureStatus: null,
        fileHash: hashNormalizedConciliation(dayResult.normalized),
        failureDiagnostics: null,
        prepaymentFeeAmount,
        prepaymentDisbursementAmount,
      });
      days.push({ referenceDate: dayResult.referenceDate, status: "succeeded", recordCount: records.length, error: null });
    } else if (dayResult.status === "no_data") {
      // Arquivo ainda não publicado é o caso mais comum e esperado (nunca um erro) — a execução é concluída como sucesso, sem registros.
      await repo.finishImportRun({ id: run.id, status: "succeeded", recordCount: 0, errorSanitized: null, failureStatus: null, fileHash: null, failureDiagnostics: dayResult.failureDiagnostics });
      days.push({ referenceDate: dayResult.referenceDate, status: "succeeded", recordCount: 0, error: null });
    } else {
      await repo.finishImportRun({ id: run.id, status: "failed", recordCount: null, errorSanitized: dayResult.error, failureStatus: dayResult.status, fileHash: null, failureDiagnostics: dayResult.failureDiagnostics });
      days.push({ referenceDate: dayResult.referenceDate, status: "failed", recordCount: null, error: dayResult.error });
    }
  }

  const limitations: string[] = [];
  let reconciliationResultsPersisted = 0;
  let divergencesPersisted = 0;

  const reconciliation = await reconcileStoneWithJumpparkForPeriod(input.fromDate, input.toDate);
  if (reconciliation.status === "ok") {
    const reconciliationRecords: StoneReconciliationResultRecord[] = reconciliation.results.map((r) => ({
      naturalKey: buildReconciliationNaturalKey(r),
      stoneSaleExternalKey: r.stoneSale?.externalReference ?? null,
      jumpparkOrderExternalId: r.jumpparkOrder?.externalReference ?? null,
      matchType: r.type,
      confidence: r.confidence,
      heuristicScore: r.heuristicScore,
      favorableSignals: r.favorableSignals,
      contrarySignals: r.contrarySignals,
      ruleApplied: r.ruleApplied,
      periodFrom: input.fromDate,
      periodTo: input.toDate,
    }));
    await repo.upsertReconciliationResults(reconciliationRecords);
    reconciliationResultsPersisted = reconciliationRecords.length;

    const divergenceRecords: StoneDivergenceRecord[] = reconciliation.divergences.map((d) => ({
      naturalKey: buildDivergenceNaturalKey(d),
      type: d.type,
      priority: d.priority,
      financialImpact: d.financialImpact,
      evidence: d.evidence,
      involvedStoneSaleExternalKey: d.involvedRecords.stoneSaleRef,
      involvedJumpparkOrderExternalId: d.involvedRecords.jumpparkOrderRef,
      confidence: d.confidence,
      recommendation: d.reviewRecommendation,
      periodFrom: input.fromDate,
      periodTo: input.toDate,
    }));
    await repo.upsertDivergences(divergenceRecords);
    divergencesPersisted = divergenceRecords.length;
    limitations.push(...reconciliation.limitations);
  } else {
    limitations.push(reconciliation.error ?? "Conciliação Stone × JumpPark não pôde ser calculada neste período.");
  }

  const anyFailed = days.some((d) => d.status === "failed");
  const allFailed = days.length > 0 && days.every((d) => d.status === "failed");
  const status: SyncStonePeriodStatus = allFailed ? "no_data" : anyFailed ? "partial" : "ok";

  return { status, days, transactionsPersisted, reconciliationResultsPersisted, divergencesPersisted, dataAvailableThroughDate: availableThrough, limitations };
}
