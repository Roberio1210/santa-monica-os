import "server-only";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  stoneDivergences as stoneDivergencesTable,
  stoneImportRuns as stoneImportRunsTable,
  stoneNormalizedTransactions as stoneNormalizedTransactionsTable,
  stonePaymentGroups as stonePaymentGroupsTable,
  stoneReconciliationResults as stoneReconciliationResultsTable,
} from "@/db/schema/stone";
import type { StonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository";
import type {
  AssignPaymentGroupResult,
  FinishImportRunInput,
  PaymentGroupConflictField,
  StartImportRunInput,
  StoneDivergenceRecord,
  StoneDivergenceRow,
  StoneFileLayout,
  StoneImportRun,
  StoneNormalizedTransactionRecord,
  StonePaymentGroupRecord,
  StoneReconciliationResultRecord,
  StoneReconciliationResultRow,
  StoneReviewStatus,
  UpdateDivergenceReviewInput,
  UpsertPaymentGroupsResult,
} from "@/lib/integrations/stone/persistence/types";

type ImportRunRow = typeof stoneImportRunsTable.$inferSelect;
type NormalizedTransactionRow = typeof stoneNormalizedTransactionsTable.$inferSelect;
type ReconciliationResultDbRow = typeof stoneReconciliationResultsTable.$inferSelect;
type DivergenceDbRow = typeof stoneDivergencesTable.$inferSelect;

function toImportRun(row: ImportRunRow): StoneImportRun {
  return {
    id: row.id,
    requestedPeriodFrom: row.requestedPeriodFrom,
    requestedPeriodTo: row.requestedPeriodTo,
    referenceDate: row.referenceDate,
    layout: row.layout,
    fileHash: row.fileHash,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    status: row.status,
    recordCount: row.recordCount,
    errorSanitized: row.errorSanitized,
    failureStatus: row.failureStatus,
    failureStage: row.failureStage,
    failureCategory: row.failureCategory,
    upstreamStatus: row.upstreamStatus,
    responseContentType: row.responseContentType,
    attemptCount: row.attemptCount,
    elapsedMs: row.elapsedMs,
    sanitizedHost: row.sanitizedHost,
    sanitizedPath: row.sanitizedPath,
    occurredAt: row.occurredAt ? row.occurredAt.toISOString() : null,
    origin: row.origin,
    prepaymentFeeAmount: row.prepaymentFeeAmount !== null ? Number(row.prepaymentFeeAmount) : null,
    prepaymentDisbursementAmount: row.prepaymentDisbursementAmount !== null ? Number(row.prepaymentDisbursementAmount) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toNormalizedTransaction(row: NormalizedTransactionRow): StoneNormalizedTransactionRecord {
  return {
    externalKey: row.externalKey,
    acquirerTransactionKey: row.acquirerTransactionKey,
    authorizationCode: row.authorizationCode,
    initiatorTransactionKey: row.initiatorTransactionKey,
    establishmentCode: row.establishmentCode,
    terminalSerialNumber: row.terminalSerialNumber,
    capturedAt: row.capturedAt.toISOString(),
    installmentNumber: row.installmentNumber,
    grossAmount: Number(row.grossAmount),
    feeAmount: Number(row.feeAmount),
    netAmount: Number(row.netAmount),
    paymentMethod: row.paymentMethod,
    brandId: row.brandId,
    eventType: row.eventType,
    receivableState: row.receivableState,
    expectedPaymentDate: row.expectedPaymentDate,
    settledPaymentDate: row.settledPaymentDate,
    settledAmount: row.settledAmount !== null ? Number(row.settledAmount) : null,
    mdrAmountStone: row.mdrAmountStone !== null ? Number(row.mdrAmountStone) : null,
    saleFeeCombined: row.saleFeeCombined !== null ? Number(row.saleFeeCombined) : null,
    advanceFeeAmountStone: row.advanceFeeAmountStone !== null ? Number(row.advanceFeeAmountStone) : null,
    sourceFile: row.sourceFile,
    importRunId: row.importRunId,
    paymentGroupId: row.paymentGroupId,
  };
}

function toReconciliationResultRow(row: ReconciliationResultDbRow): StoneReconciliationResultRow {
  return {
    id: row.id,
    naturalKey: row.naturalKey,
    stoneSaleExternalKey: row.stoneSaleExternalKey,
    jumpparkOrderExternalId: row.jumpparkOrderExternalId,
    matchType: row.matchType,
    confidence: row.confidence,
    heuristicScore: row.heuristicScore,
    favorableSignals: row.favorableSignals,
    contrarySignals: row.contrarySignals,
    ruleApplied: row.ruleApplied,
    reviewStatus: row.reviewStatus,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDivergenceRow(row: DivergenceDbRow): StoneDivergenceRow {
  return {
    id: row.id,
    naturalKey: row.naturalKey,
    type: row.type,
    priority: row.priority,
    financialImpact: Number(row.financialImpact),
    evidence: row.evidence,
    involvedStoneSaleExternalKey: row.involvedStoneSaleExternalKey,
    involvedJumpparkOrderExternalId: row.involvedJumpparkOrderExternalId,
    confidence: row.confidence,
    recommendation: row.recommendation,
    status: row.status,
    assignee: row.assignee,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Implementação Postgres da persistência Stone (Sprint 7.0, Z4) — usada quando `DATABASE_URL`
 * está configurada. Toda idempotência é garantida por `onConflictDoUpdate` sobre os índices únicos
 * de `src/db/schema/stone.ts` (nunca lê-antes-de-escrever para decidir insert vs. update — evita
 * condição de corrida em importação concorrente do mesmo dia).
 */
export class StonePostgresRepository implements StonePersistenceRepository {
  private db() {
    const db = getDb();
    if (!db) throw new Error("Banco de dados não configurado (DATABASE_URL ausente).");
    return db;
  }

  async startImportRun(input: StartImportRunInput): Promise<StoneImportRun> {
    const [row] = await this.db()
      .insert(stoneImportRunsTable)
      .values({
        requestedPeriodFrom: input.requestedPeriodFrom,
        requestedPeriodTo: input.requestedPeriodTo,
        referenceDate: input.referenceDate,
        layout: input.layout,
        origin: input.origin,
        status: "running",
        startedAt: new Date(),
        finishedAt: null,
        recordCount: null,
        errorSanitized: null,
        failureStatus: null,
        failureStage: null,
        failureCategory: null,
        upstreamStatus: null,
        responseContentType: null,
        attemptCount: null,
        elapsedMs: null,
        sanitizedHost: null,
        sanitizedPath: null,
        occurredAt: null,
      })
      .onConflictDoUpdate({
        target: [stoneImportRunsTable.referenceDate, stoneImportRunsTable.layout],
        set: {
          requestedPeriodFrom: input.requestedPeriodFrom,
          requestedPeriodTo: input.requestedPeriodTo,
          origin: input.origin,
          status: "running",
          startedAt: new Date(),
          finishedAt: null,
          errorSanitized: null,
          failureStatus: null,
          failureStage: null,
          failureCategory: null,
          upstreamStatus: null,
          responseContentType: null,
          attemptCount: null,
          elapsedMs: null,
          sanitizedHost: null,
          sanitizedPath: null,
          occurredAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toImportRun(row);
  }

  async finishImportRun(input: FinishImportRunInput): Promise<StoneImportRun> {
    const [row] = await this.db()
      .update(stoneImportRunsTable)
      .set({
        status: input.status,
        recordCount: input.recordCount,
        errorSanitized: input.errorSanitized,
        failureStatus: input.failureStatus,
        failureStage: input.failureDiagnostics?.stage ?? null,
        failureCategory: input.failureDiagnostics?.category ?? null,
        upstreamStatus: input.failureDiagnostics?.upstreamStatus ?? null,
        responseContentType: input.failureDiagnostics?.responseContentType ?? null,
        attemptCount: input.failureDiagnostics?.attemptCount ?? null,
        elapsedMs: input.failureDiagnostics?.elapsedMs ?? null,
        sanitizedHost: input.failureDiagnostics?.sanitizedHost ?? null,
        sanitizedPath: input.failureDiagnostics?.sanitizedPath ?? null,
        occurredAt: input.failureDiagnostics ? new Date() : null,
        ...(input.fileHash !== null ? { fileHash: input.fileHash } : {}),
        ...(input.prepaymentFeeAmount !== undefined ? { prepaymentFeeAmount: input.prepaymentFeeAmount !== null ? String(input.prepaymentFeeAmount) : null } : {}),
        ...(input.prepaymentDisbursementAmount !== undefined ? { prepaymentDisbursementAmount: input.prepaymentDisbursementAmount !== null ? String(input.prepaymentDisbursementAmount) : null } : {}),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stoneImportRunsTable.id, input.id))
      .returning();
    if (!row) throw new Error(`Import run não encontrada: ${input.id}`);
    return toImportRun(row);
  }

  async getImportRun(referenceDate: string, layout: StoneFileLayout): Promise<StoneImportRun | null> {
    const rows = await this.db()
      .select()
      .from(stoneImportRunsTable)
      .where(and(eq(stoneImportRunsTable.referenceDate, referenceDate), eq(stoneImportRunsTable.layout, layout)))
      .limit(1);
    return rows[0] ? toImportRun(rows[0]) : null;
  }

  async listImportRuns(limit: number): Promise<StoneImportRun[]> {
    const rows = await this.db().select().from(stoneImportRunsTable).orderBy(desc(stoneImportRunsTable.startedAt)).limit(limit);
    return rows.map(toImportRun);
  }

  async getLatestSucceededImportRun(): Promise<StoneImportRun | null> {
    const rows = await this.db()
      .select()
      .from(stoneImportRunsTable)
      .where(eq(stoneImportRunsTable.status, "succeeded"))
      .orderBy(desc(stoneImportRunsTable.finishedAt))
      .limit(1);
    return rows[0] ? toImportRun(rows[0]) : null;
  }

  async upsertNormalizedTransactions(records: StoneNormalizedTransactionRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    await db.transaction(async (tx) => {
      for (const record of records) {
        await tx
          .insert(stoneNormalizedTransactionsTable)
          .values({
            externalKey: record.externalKey,
            acquirerTransactionKey: record.acquirerTransactionKey,
            authorizationCode: record.authorizationCode,
            initiatorTransactionKey: record.initiatorTransactionKey,
            establishmentCode: record.establishmentCode,
            terminalSerialNumber: record.terminalSerialNumber,
            capturedAt: new Date(record.capturedAt),
            installmentNumber: record.installmentNumber,
            grossAmount: String(record.grossAmount),
            feeAmount: String(record.feeAmount),
            netAmount: String(record.netAmount),
            paymentMethod: record.paymentMethod,
            brandId: record.brandId,
            eventType: record.eventType,
            receivableState: record.receivableState,
            expectedPaymentDate: record.expectedPaymentDate,
            settledPaymentDate: record.settledPaymentDate,
            settledAmount: record.settledAmount !== null ? String(record.settledAmount) : null,
            mdrAmountStone: record.mdrAmountStone !== null ? String(record.mdrAmountStone) : null,
            saleFeeCombined: record.saleFeeCombined !== null ? String(record.saleFeeCombined) : null,
            advanceFeeAmountStone: record.advanceFeeAmountStone !== null ? String(record.advanceFeeAmountStone) : null,
            sourceFile: record.sourceFile,
            importRunId: record.importRunId,
          })
          .onConflictDoUpdate({
            target: stoneNormalizedTransactionsTable.externalKey,
            set: {
              eventType: record.eventType,
              receivableState: record.receivableState,
              settledPaymentDate: record.settledPaymentDate,
              settledAmount: record.settledAmount !== null ? String(record.settledAmount) : null,
              mdrAmountStone: record.mdrAmountStone !== null ? String(record.mdrAmountStone) : null,
              saleFeeCombined: record.saleFeeCombined !== null ? String(record.saleFeeCombined) : null,
              advanceFeeAmountStone: record.advanceFeeAmountStone !== null ? String(record.advanceFeeAmountStone) : null,
              sourceFile: record.sourceFile,
              importRunId: record.importRunId,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async listNormalizedTransactionsByExpectedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(gte(stoneNormalizedTransactionsTable.expectedPaymentDate, fromDate), lte(stoneNormalizedTransactionsTable.expectedPaymentDate, toDate)));
    return rows.map(toNormalizedTransaction);
  }

  async listNormalizedTransactionsBySettledDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(gte(stoneNormalizedTransactionsTable.settledPaymentDate, fromDate), lte(stoneNormalizedTransactionsTable.settledPaymentDate, toDate)));
    return rows.map(toNormalizedTransaction);
  }

  async listNormalizedTransactionsByCapturedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(gte(stoneNormalizedTransactionsTable.capturedAt, new Date(`${fromDate}T00:00:00.000Z`)), lte(stoneNormalizedTransactionsTable.capturedAt, new Date(`${toDate}T23:59:59.999Z`))));
    return rows.map(toNormalizedTransaction);
  }

  async getNormalizedTransactionByExternalKey(externalKey: string): Promise<StoneNormalizedTransactionRecord | null> {
    const rows = await this.db().select().from(stoneNormalizedTransactionsTable).where(eq(stoneNormalizedTransactionsTable.externalKey, externalKey)).limit(1);
    return rows[0] ? toNormalizedTransaction(rows[0]) : null;
  }

  async findNormalizedTransactionsByAcquirerKeyAndInstallment(acquirerTransactionKey: string, installmentNumber: number): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(eq(stoneNormalizedTransactionsTable.acquirerTransactionKey, acquirerTransactionKey), eq(stoneNormalizedTransactionsTable.installmentNumber, installmentNumber)));
    return rows.map(toNormalizedTransaction);
  }

  async updateSettlementInfo(externalKey: string, settledPaymentDate: string, settledAmount: number): Promise<boolean> {
    // A guarda `isNull(settledPaymentDate)` vive na própria cláusula WHERE — nunca lê-antes-de-escrever
    // para decidir (mesmo princípio de idempotência via constraint do resto deste repositório, nunca
    // condição de corrida entre duas execuções concorrentes tentando liquidar a mesma parcela).
    const rows = await this.db()
      .update(stoneNormalizedTransactionsTable)
      .set({ settledPaymentDate, settledAmount: String(settledAmount), updatedAt: new Date() })
      .where(and(eq(stoneNormalizedTransactionsTable.externalKey, externalKey), isNull(stoneNormalizedTransactionsTable.settledPaymentDate)))
      .returning({ externalKey: stoneNormalizedTransactionsTable.externalKey });
    return rows.length > 0;
  }

  async upsertPaymentGroups(groups: StonePaymentGroupRecord[]): Promise<UpsertPaymentGroupsResult> {
    const idByPaymentId: Record<string, string> = {};
    const conflicts: { paymentId: string; fields: PaymentGroupConflictField[] }[] = [];
    if (groups.length === 0) return { idByPaymentId, conflicts };

    const db = this.db();
    for (const group of groups) {
      // ON CONFLICT (payment_id) DO UPDATE ... WHERE — só atualiza (e devolve linha) quando
      // payment_date/total_amount/wallet_type_id do que já existe são compatíveis com o novo
      // dado; se a WHERE falhar, a linha existente fica intocada e nada é devolvido (nunca um
      // erro) — exatamente o comportamento nativo do Postgres para essa cláusula.
      const [row] = await db
        .insert(stonePaymentGroupsTable)
        .values({
          paymentId: group.paymentId,
          paymentDate: group.paymentDate,
          totalAmount: String(group.totalAmount),
          walletTypeId: group.walletTypeId,
          sourceFile: group.sourceFile,
          importRunId: group.importRunId,
        })
        .onConflictDoUpdate({
          target: stonePaymentGroupsTable.paymentId,
          set: {
            walletTypeId: group.walletTypeId !== null ? sql`coalesce(${stonePaymentGroupsTable.walletTypeId}, ${group.walletTypeId})` : sql`${stonePaymentGroupsTable.walletTypeId}`,
            updatedAt: new Date(),
          },
          // Passar um `null` como parâmetro numa comparação (`$n is null`) deixa o Postgres sem
          // como inferir o tipo do parâmetro numa prepared statement ("could not determine data
          // type of parameter") — por isso a cláusula do wallet_type_id só entra no SQL quando o
          // valor recebido é realmente um número; quando é `null`, a condição já é sempre
          // verdadeira (nunca bloqueia por causa de um campo que nem chegou preenchido).
          setWhere:
            group.walletTypeId !== null
              ? sql`${stonePaymentGroupsTable.paymentDate} = ${group.paymentDate}
                and ${stonePaymentGroupsTable.totalAmount} = ${String(group.totalAmount)}
                and (${stonePaymentGroupsTable.walletTypeId} is null or ${stonePaymentGroupsTable.walletTypeId} = ${group.walletTypeId})`
              : sql`${stonePaymentGroupsTable.paymentDate} = ${group.paymentDate}
                and ${stonePaymentGroupsTable.totalAmount} = ${String(group.totalAmount)}`,
        })
        .returning({ id: stonePaymentGroupsTable.id });

      if (row) {
        idByPaymentId[group.paymentId] = row.id;
        continue;
      }

      // WHERE não bateu -> grupo já existe com metadata incompatível. Busca o existente só para
      // relatar exatamente quais campos divergem (nunca para decidir sobrescrever).
      const [existing] = await db.select().from(stonePaymentGroupsTable).where(eq(stonePaymentGroupsTable.paymentId, group.paymentId)).limit(1);
      const fields: PaymentGroupConflictField[] = [];
      if (existing) {
        if (existing.paymentDate !== group.paymentDate) fields.push("payment_date");
        if (Math.abs(Number(existing.totalAmount) - group.totalAmount) > 0.005) fields.push("total_amount");
        if (existing.walletTypeId !== null && group.walletTypeId !== null && existing.walletTypeId !== group.walletTypeId) fields.push("wallet_type_id");
      }
      conflicts.push({ paymentId: group.paymentId, fields });
    }

    return { idByPaymentId, conflicts };
  }

  async assignPaymentGroup(externalKey: string, paymentGroupId: string): Promise<AssignPaymentGroupResult> {
    const db = this.db();
    const [updated] = await db
      .update(stoneNormalizedTransactionsTable)
      .set({ paymentGroupId, updatedAt: new Date() })
      .where(and(eq(stoneNormalizedTransactionsTable.externalKey, externalKey), isNull(stoneNormalizedTransactionsTable.paymentGroupId)))
      .returning({ externalKey: stoneNormalizedTransactionsTable.externalKey });

    if (updated) return "assigned";

    const [row] = await db.select({ paymentGroupId: stoneNormalizedTransactionsTable.paymentGroupId }).from(stoneNormalizedTransactionsTable).where(eq(stoneNormalizedTransactionsTable.externalKey, externalKey)).limit(1);
    if (row?.paymentGroupId === paymentGroupId) return "same_group";
    return "conflict";
  }

  async upsertReconciliationResults(records: StoneReconciliationResultRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    await db.transaction(async (tx) => {
      for (const record of records) {
        await tx
          .insert(stoneReconciliationResultsTable)
          .values({
            naturalKey: record.naturalKey,
            stoneSaleExternalKey: record.stoneSaleExternalKey,
            jumpparkOrderExternalId: record.jumpparkOrderExternalId,
            matchType: record.matchType,
            confidence: record.confidence,
            heuristicScore: record.heuristicScore,
            favorableSignals: record.favorableSignals,
            contrarySignals: record.contrarySignals,
            ruleApplied: record.ruleApplied,
            periodFrom: record.periodFrom,
            periodTo: record.periodTo,
          })
          .onConflictDoUpdate({
            target: stoneReconciliationResultsTable.naturalKey,
            set: {
              confidence: record.confidence,
              heuristicScore: record.heuristicScore,
              favorableSignals: record.favorableSignals,
              contrarySignals: record.contrarySignals,
              ruleApplied: record.ruleApplied,
              periodFrom: record.periodFrom,
              periodTo: record.periodTo,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async listReconciliationResults(periodFrom: string, periodTo: string): Promise<StoneReconciliationResultRow[]> {
    const rows = await this.db()
      .select()
      .from(stoneReconciliationResultsTable)
      .where(and(lte(stoneReconciliationResultsTable.periodFrom, periodTo), gte(stoneReconciliationResultsTable.periodTo, periodFrom)));
    return rows.map(toReconciliationResultRow);
  }

  async updateReconciliationReviewStatus(id: string, status: StoneReviewStatus): Promise<StoneReconciliationResultRow> {
    const [row] = await this.db()
      .update(stoneReconciliationResultsTable)
      .set({ reviewStatus: status, updatedAt: new Date() })
      .where(eq(stoneReconciliationResultsTable.id, id))
      .returning();
    if (!row) throw new Error(`Resultado de conciliação não encontrado: ${id}`);
    return toReconciliationResultRow(row);
  }

  async getReconciliationResultById(id: string): Promise<StoneReconciliationResultRow | null> {
    const rows = await this.db().select().from(stoneReconciliationResultsTable).where(eq(stoneReconciliationResultsTable.id, id)).limit(1);
    return rows[0] ? toReconciliationResultRow(rows[0]) : null;
  }

  async upsertDivergences(records: StoneDivergenceRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    await db.transaction(async (tx) => {
      for (const record of records) {
        // Nunca sobrescreve status/assignee/resolutionNote de uma divergência já revisada por um humano.
        await tx
          .insert(stoneDivergencesTable)
          .values({
            naturalKey: record.naturalKey,
            type: record.type,
            priority: record.priority,
            financialImpact: String(record.financialImpact),
            evidence: record.evidence,
            involvedStoneSaleExternalKey: record.involvedStoneSaleExternalKey,
            involvedJumpparkOrderExternalId: record.involvedJumpparkOrderExternalId,
            confidence: record.confidence,
            recommendation: record.recommendation,
            periodFrom: record.periodFrom,
            periodTo: record.periodTo,
          })
          .onConflictDoUpdate({
            target: stoneDivergencesTable.naturalKey,
            set: {
              priority: record.priority,
              financialImpact: String(record.financialImpact),
              evidence: record.evidence,
              confidence: record.confidence,
              recommendation: record.recommendation,
              periodFrom: record.periodFrom,
              periodTo: record.periodTo,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async listDivergences(filter?: { status?: StoneReviewStatus }): Promise<StoneDivergenceRow[]> {
    const query = this.db().select().from(stoneDivergencesTable);
    const rows = filter?.status ? await query.where(eq(stoneDivergencesTable.status, filter.status)) : await query;
    return rows.map(toDivergenceRow);
  }

  async updateDivergenceReview(input: UpdateDivergenceReviewInput): Promise<StoneDivergenceRow> {
    const [row] = await this.db()
      .update(stoneDivergencesTable)
      .set({
        status: input.status,
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {}),
        resolvedAt: input.status === "resolved" ? new Date() : sql`${stoneDivergencesTable.resolvedAt}`,
        updatedAt: new Date(),
      })
      .where(eq(stoneDivergencesTable.id, input.id))
      .returning();
    if (!row) throw new Error(`Divergência não encontrada: ${input.id}`);
    return toDivergenceRow(row);
  }
}
