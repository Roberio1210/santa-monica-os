import "server-only";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import {
  summarizePeriodCost,
  buildDailyCostBreakdown,
  buildModalityCostBreakdown,
  buildTransactionDetailRows,
  findWorstCostDay,
  type StoneCostPeriodSummary,
  type StoneCostDailyRow,
  type StoneCostModalityRow,
  type StoneCostTransactionDetailRow,
} from "@/lib/integrations/stone/costAnalysis";

/**
 * Missão Financeiro V6 — agregador único da seção "Custo real Stone por venda" da tela Stone
 * Conciliação. Mesmo padrão de `pageData.ts`: a página nunca monta a consulta na mão. Busca por
 * `capturedAt` (data da venda, ver `repository.ts`) — nunca a data esperada/liquidada, que é o
 * que a agenda financeira (`financialScheduleService.ts`) já usa para outro propósito.
 */
export interface StoneCostAnalysisPageData {
  periodFrom: string;
  periodTo: string;
  summary: StoneCostPeriodSummary;
  dailyRows: StoneCostDailyRow[];
  modalityRows: StoneCostModalityRow[];
  detailRows: StoneCostTransactionDetailRow[];
  worstDay: StoneCostDailyRow | null;
}

export async function getStoneCostAnalysisPageData(periodFrom: string, periodTo: string): Promise<StoneCostAnalysisPageData> {
  const repo = getStonePersistenceRepository();
  const records = await repo.listNormalizedTransactionsByCapturedDateRange(periodFrom, periodTo);

  const summary = summarizePeriodCost(records, periodFrom, periodTo);
  const dailyRows = buildDailyCostBreakdown(records);
  const modalityRows = buildModalityCostBreakdown(records);
  const detailRows = buildTransactionDetailRows(records);
  const worstDay = findWorstCostDay(dailyRows);

  return { periodFrom, periodTo, summary, dailyRows, modalityRows, detailRows, worstDay };
}
