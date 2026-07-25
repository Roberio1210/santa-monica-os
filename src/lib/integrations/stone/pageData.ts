import "server-only";
import { addDaysIso } from "@/lib/utils/timezone";
import { getStoneIntegrationHealth, type StoneIntegrationHealthReport } from "@/lib/integrations/stone/healthStatus";
import { buildFinancialScheduleForToday, type FinancialScheduleResult } from "@/lib/integrations/stone/financialScheduleService";
import { buildReconciliationSummary, type StoneReconciliationSummary } from "@/lib/integrations/stone/reconciliationSummary";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneDivergenceRow, StoneImportRun, StoneReconciliationResultRow } from "@/lib/integrations/stone/persistence/types";

/**
 * Agregador único da tela Stone Conciliação (Sprint 7.0, Z4) — mesmo padrão de
 * `dashboard/central.ts`: a página nunca monta a consulta na mão, sempre por aqui. Combina o Z2
 * (resumo do último dia com dado real), o Z3 (Agenda Financeira, cálculo puro) e o Z4 (histórico
 * persistido de importação/conciliação/divergências).
 */
export interface StoneConciliacaoPageData {
  health: StoneIntegrationHealthReport;
  summary: StoneReconciliationSummary | null;
  schedule: FinancialScheduleResult;
  reconciliationResults: StoneReconciliationResultRow[];
  divergences: StoneDivergenceRow[];
  importRuns: StoneImportRun[];
  periodFrom: string;
  periodTo: string;
}

const DEFAULT_LOOKBACK_DAYS = 30;
const IMPORT_RUN_HISTORY_LIMIT = 20;

export async function getStoneConciliacaoPageData(todayIso: string): Promise<StoneConciliacaoPageData> {
  const periodFrom = addDaysIso(todayIso, -DEFAULT_LOOKBACK_DAYS);
  const repo = getStonePersistenceRepository();

  const [health, schedule, importRuns] = await Promise.all([
    getStoneIntegrationHealth(),
    buildFinancialScheduleForToday(todayIso, DEFAULT_LOOKBACK_DAYS),
    repo.listImportRuns(IMPORT_RUN_HISTORY_LIMIT),
  ]);

  const latestDataDate = health.lastSuccessfulImportRun?.referenceDate ?? null;
  const [summary, reconciliationResults, divergences] = await Promise.all([
    latestDataDate ? buildReconciliationSummary(latestDataDate) : Promise.resolve(null),
    repo.listReconciliationResults(periodFrom, todayIso),
    repo.listDivergences(),
  ]);

  return { health, summary, schedule, reconciliationResults, divergences, importRuns, periodFrom, periodTo: todayIso };
}
