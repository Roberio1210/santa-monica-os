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
import { fetchStoneSettlementReconciliation } from "@/lib/finance/bankStatement/stoneSettlementReconciliationService";
import { fetchFinancialAccounts } from "@/lib/finance/service";
import type { StoneSettlementReconciliationRow } from "@/lib/finance/bankStatement/stoneSettlementReconciliation";

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
  /**
   * Missão V6.2 — conciliação diária venda × crédito real na conta Stone (`bank_statement_lines`,
   * ver `stoneSettlementReconciliationService.ts`). Vazio até que um extrato real seja importado
   * para a conta Stone — nunca um erro, só ausência de dado ainda não fornecido.
   */
  settlementReconciliation: StoneSettlementReconciliationRow[];
}

export async function getStoneCostAnalysisPageData(periodFrom: string, periodTo: string): Promise<StoneCostAnalysisPageData> {
  const repo = getStonePersistenceRepository();
  const [records, financialAccounts] = await Promise.all([repo.listNormalizedTransactionsByCapturedDateRange(periodFrom, periodTo), fetchFinancialAccounts()]);

  const summary = summarizePeriodCost(records, periodFrom, periodTo);
  const dailyRows = buildDailyCostBreakdown(records);
  const modalityRows = buildModalityCostBreakdown(records);
  const detailRows = buildTransactionDetailRows(records);
  const worstDay = findWorstCostDay(dailyRows);

  const stoneAccount = financialAccounts.find((a) => a.name.toLowerCase() === "stone");
  const settlementReconciliation = stoneAccount ? await fetchStoneSettlementReconciliation(stoneAccount.id, periodFrom, periodTo) : [];

  return { periodFrom, periodTo, summary, dailyRows, modalityRows, detailRows, worstDay, settlementReconciliation };
}
