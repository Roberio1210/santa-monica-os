import "server-only";
import { computeDreReport } from "@/lib/finance/dre";
import { computeDreSnapshotHash, DRE_SNAPSHOT_HASH_ALGORITHM, verifyDreSnapshotIntegrity } from "@/lib/finance/dreSnapshotHash";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { fetchDreSourceData, lastDayOfMonth, type DreSourceData } from "@/lib/finance/service";
import { DATA_CORTE_JUMPPARK } from "@/lib/config/historical-source-precedence";
import type { AccountingPeriod, DreReport, DreSnapshot, FinancialPeriodSourceInfo } from "@/lib/finance/types";

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

// --- Missão UX/Navegação 2 — precedência histórica de leitura (fechado_oficial > fonte_historica/calculado > parcial) ---

/**
 * Parte pura (sem banco), testável isoladamente. `hasRevenueData` já vem resolvido pelo chamador
 * (`report.receitaBruta !== null`, quando não há snapshot oficial) — nunca decide sozinha o que é
 * "dado suficiente", só traduz o que `computeDreReport` já concluiu (mesmo princípio "ausência de
 * dado ≠ zero" usado em toda a DRE) num status de nível de período.
 */
export function resolveFinancialPeriodSourceStatus(input: {
  competenceFrom: string;
  competenceTo: string;
  officialSnapshot: Pick<DreSnapshot, "version"> | null;
  hasRevenueData: boolean;
  officialSnapshotMonthsInRange: string[];
}): FinancialPeriodSourceInfo {
  if (input.officialSnapshot) {
    return {
      status: "fechado_oficial",
      label: "Fechado oficialmente",
      crossesHistoricalCutoff: false,
      officialSnapshotVersion: input.officialSnapshot.version,
      officialSnapshotMonthsInRange: input.officialSnapshotMonthsInRange,
    };
  }

  const entirelyHistorical = input.competenceTo < DATA_CORTE_JUMPPARK;
  const entirelyLive = input.competenceFrom >= DATA_CORTE_JUMPPARK;
  const crossesHistoricalCutoff = !entirelyHistorical && !entirelyLive;

  if (!input.hasRevenueData) {
    return {
      status: "parcial",
      label: "Dados parciais — sem receita reconhecível em nenhuma fonte para este período",
      crossesHistoricalCutoff,
      officialSnapshotVersion: null,
      officialSnapshotMonthsInRange: input.officialSnapshotMonthsInRange,
    };
  }

  if (entirelyHistorical) {
    return {
      status: "fonte_historica",
      label: "Histórico disponível (planilha)",
      crossesHistoricalCutoff: false,
      officialSnapshotVersion: null,
      officialSnapshotMonthsInRange: input.officialSnapshotMonthsInRange,
    };
  }

  return {
    status: "calculado",
    label: "Calculado a partir dos registros",
    crossesHistoricalCutoff,
    officialSnapshotVersion: null,
    officialSnapshotMonthsInRange: input.officialSnapshotMonthsInRange,
  };
}

/** Meses inteiros contidos por completo dentro de [from, to] — usado só para informar `officialSnapshotMonthsInRange`, nunca para decidir o status principal de um intervalo personalizado. */
function monthsFullyWithinRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = `${from.slice(0, 7)}-01`;
  while (cursor <= to) {
    const month = cursor.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = lastDayOfMonth(month);
    if (monthStart >= from && monthEnd <= to) months.push(month);
    const [year, monthNumber] = month.split("-").map(Number);
    cursor = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  }
  return months;
}

export interface FinancialPeriodOverview {
  report: DreReport;
  status: FinancialPeriodSourceInfo;
}

/**
 * Missão UX/Navegação 2 — visão única de QUALQUER período financeiro (mês inteiro ou intervalo
 * personalizado), já resolvendo a precedência completa: se [competenceFrom, competenceTo] é
 * EXATAMENTE um mês calendário com fechamento oficial, lê o snapshot congelado (nunca recalcula,
 * nunca o altera). Caso contrário, calcula ao vivo via `computeDreReport` — que já aplica a
 * precedência histórica/JumpPark por data (`dre.ts`) — e classifica o resultado.
 *
 * `officialSnapshotMonthsInRange` é sempre calculado, mesmo quando o intervalo não é elegível a
 * "fechado_oficial" sozinho — permite a UI avisar "este recorte é cálculo ao vivo; agosto/2026 tem
 * fechamento oficial, mas para o mês inteiro, não para este recorte parcial".
 */
export async function fetchFinancialPeriodOverview(competenceFrom: string, competenceTo: string, preFetchedData?: DreSourceData): Promise<FinancialPeriodOverview> {
  const repo = getFinanceRepository();
  const exactMonth = competenceFrom === `${competenceFrom.slice(0, 7)}-01` && competenceTo === lastDayOfMonth(competenceFrom.slice(0, 7)) ? competenceFrom.slice(0, 7) : null;
  const monthsInRange = monthsFullyWithinRange(competenceFrom, competenceTo);

  const [officialSnapshot, officialSnapshotMonthsResolved] = await Promise.all([
    exactMonth ? repo.getOfficialDreSnapshot(exactMonth) : Promise.resolve(null),
    Promise.all(monthsInRange.map(async (month) => ((await repo.getOfficialDreSnapshot(month)) ? month : null))),
  ]);
  const officialSnapshotMonthsInRange = officialSnapshotMonthsResolved.filter((m): m is string => m !== null);

  if (officialSnapshot) {
    return {
      report: officialSnapshot.reportPayload,
      status: resolveFinancialPeriodSourceStatus({ competenceFrom, competenceTo, officialSnapshot, hasRevenueData: true, officialSnapshotMonthsInRange }),
    };
  }

  const data = preFetchedData ?? (await fetchDreSourceData());
  const report = computeDreReport({ regime: "gerencial", competenceFrom, competenceTo, costCenterGroup: "consolidado", ...data });

  return {
    report,
    status: resolveFinancialPeriodSourceStatus({ competenceFrom, competenceTo, officialSnapshot: null, hasRevenueData: report.receitaBruta !== null, officialSnapshotMonthsInRange }),
  };
}
