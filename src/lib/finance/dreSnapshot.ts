import "server-only";
import { computeDreReport } from "@/lib/finance/dre";
import { computeDreSnapshotHash, DRE_SNAPSHOT_HASH_ALGORITHM, verifyDreSnapshotIntegrity } from "@/lib/finance/dreSnapshotHash";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { fetchDreSourceData, lastDayOfMonth } from "@/lib/finance/service";
import type { AccountingPeriod, DreReport, DreSnapshot } from "@/lib/finance/types";

/**
 * Missão Financeiro V7 (Fase C7) — identifica a LÓGICA de cálculo usada num fechamento, não os
 * dados. Bump manual sempre que `computeDreReport`/`corporatePartnerRevenue.ts`/qualquer regra de
 * classificação que afete a DRE mudar de forma material — permite, ao investigar um fechamento
 * antigo, distinguir "os dados mudaram" de "o motor mudou". Última mudança conhecida: Fase C3
 * (correção do bug de exclusão IESA em `corporatePartnerRevenue.ts`, 31/08/2026).
 */
export const DRE_METHODOLOGY_VERSION = "C3-iesa-fix-2026-08-31";

const DRE_REGIME = "gerencial" as const;

function countDreReportLineItems(report: DreReport): number {
  const groups = [
    report.receitaBrutaEstetica,
    report.receitaBrutaEstacionamento,
    report.receitaBrutaParceriasCorporativas,
    report.receitaBrutaOutras,
    report.deducoes,
    report.custosDiretos,
    report.despesasOperacionais,
    report.resultadoFinanceiro,
    report.tributos,
  ];
  return groups.reduce((sum, g) => sum + g.items.length, 0) + report.naoClassificados.length;
}

export interface CloseAccountingPeriodWithSnapshotInput {
  competenceMonth: string;
  closedBy: string;
  notes?: string | null;
}

export interface CloseAccountingPeriodWithSnapshotResult {
  accountingPeriod: AccountingPeriod;
  snapshot: DreSnapshot;
}

/**
 * Fechamento auditável e reproduzível (Fase C7) — único caminho que deve ser usado para fechar
 * uma competência a partir de agora (o `closeAccountingPeriod` cru do repositório continua
 * existindo só como primitiva de baixo nível, reaproveitada aqui via
 * `persistDreSnapshotAndClosePeriod`, nunca deve ser chamado sozinho por uma tela/rota nova).
 *
 * Sequência (toda a parte de escrita roda numa única transação dentro do repositório — ver
 * `persistDreSnapshotAndClosePeriod`):
 * 1. calcula o DreReport ao vivo (leitura, fora da transação);
 * 2. barra se `naoClassificados.length > 0` — nunca fecha com pendência;
 * 3. barra se os totais essenciais vierem `null` ("ausência de dado" — nada real para fechar);
 * 4. determina a próxima versão e a versão oficial anterior (se existir), a partir do histórico já
 *    persistido — nunca confia em estado em memória;
 * 5. calcula o hash canônico do payload;
 * 6. delega a escrita atômica ao repositório.
 */
export async function closeAccountingPeriodWithSnapshot(input: CloseAccountingPeriodWithSnapshotInput): Promise<CloseAccountingPeriodWithSnapshotResult> {
  const repo = getFinanceRepository();

  const existingPeriod = await repo.getAccountingPeriod(input.competenceMonth);
  if (existingPeriod?.status === "fechado") {
    throw new Error(`Competência ${input.competenceMonth} já está fechada (versão oficial vigente — reabra antes de fechar novamente).`);
  }

  const competenceFrom = `${input.competenceMonth}-01`;
  const competenceTo = lastDayOfMonth(input.competenceMonth);
  const computedAt = new Date().toISOString();

  const data = await fetchDreSourceData();
  const report = computeDreReport({ regime: DRE_REGIME, competenceFrom, competenceTo, costCenterGroup: "consolidado", ...data });

  if (report.naoClassificados.length > 0) {
    throw new Error(
      `Não é possível fechar ${input.competenceMonth}: existem ${report.naoClassificados.length} lançamento(s) não classificado(s). Classifique todos antes de fechar (ver fila de classificação).`,
    );
  }
  if (report.receitaBruta === null || report.resultadoLiquido === null) {
    throw new Error(
      `Não é possível fechar ${input.competenceMonth}: a DRE não tem dado suficiente para calcular receita/resultado (${report.receitaBrutaIndisponivelMotivo ?? "motivo não informado"}). Ausência de dado não é o mesmo que zero — não force o fechamento.`,
    );
  }

  const existingVersions = await repo.listDreSnapshots(input.competenceMonth);
  const nextVersion = existingVersions.length === 0 ? 1 : Math.max(...existingVersions.map((v) => v.version)) + 1;
  const previousOfficial = await repo.getOfficialDreSnapshot(input.competenceMonth);

  const payloadHash = computeDreSnapshotHash(report);

  const { accountingPeriod, snapshot } = await repo.persistDreSnapshotAndClosePeriod({
    competenceMonth: input.competenceMonth,
    version: nextVersion,
    regime: DRE_REGIME,
    computedAt,
    computedBy: input.closedBy,
    closedBy: input.closedBy,
    methodologyVersion: DRE_METHODOLOGY_VERSION,
    reportPayload: report,
    payloadHash,
    hashAlgorithm: DRE_SNAPSHOT_HASH_ALGORITHM,
    pendingCount: report.naoClassificados.length,
    lineItemCount: countDreReportLineItems(report),
    notes: input.notes ?? null,
    previousOfficialSnapshotId: previousOfficial?.id ?? null,
    closeAccountingPeriodInput: { competenceMonth: input.competenceMonth, closedBy: input.closedBy, notes: input.notes ?? null },
  });

  return { accountingPeriod, snapshot };
}

/**
 * Fase C7/Fase 8 — leitura oficial de um fechamento, NUNCA recalcula. Retorna null quando a
 * competência nunca foi fechada (ou está atualmente reaberta sem refechamento ainda) — nesse
 * caso a tela deve usar `fetchDreReport`/`computeDreReport` ao vivo, nunca inventar um snapshot.
 * Semanticamente distinta de `computeDreReport`: uma é "o que aconteceu e foi congelado", a outra
 * é "o que as fontes dizem agora" — nunca devem ser confundidas ou uma substituir a outra
 * silenciosamente na interface.
 */
export async function getOfficialClosedDre(competenceMonth: string): Promise<DreSnapshot | null> {
  return getFinanceRepository().getOfficialDreSnapshot(competenceMonth);
}

export interface DreSnapshotIntegrityResult {
  snapshot: DreSnapshot;
  isIntact: boolean;
  recomputedHash: string;
}

/** Reconfere, agora, que o payload lido do banco é bit-a-bit o que foi fechado (nunca editado depois). */
export async function verifyDreSnapshotIntegrityById(competenceMonth: string, version: number): Promise<DreSnapshotIntegrityResult | null> {
  const versions = await getFinanceRepository().listDreSnapshots(competenceMonth);
  const snapshot = versions.find((v) => v.version === version);
  if (!snapshot) return null;
  const recomputedHash = computeDreSnapshotHash(snapshot.reportPayload);
  return { snapshot, isIntact: verifyDreSnapshotIntegrity(snapshot.reportPayload, snapshot.payloadHash), recomputedHash };
}
