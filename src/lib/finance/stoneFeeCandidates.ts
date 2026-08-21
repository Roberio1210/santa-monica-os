import "server-only";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import { buildDailyCostBreakdown } from "@/lib/integrations/stone/costAnalysis";
import type { StoneFeeCandidateInput } from "@/lib/finance/dre";

/**
 * Missão Financeiro V6.1 — custo real Stone (MDR + antecipação D+1) para a DRE, direto de
 * `stone_normalized_transactions` (nunca de um `cash_movements`/`accounts_payable` novo — evita
 * duplicar o mesmo custo em dois lugares). Busca TODA a janela sincronizada (sem filtro de
 * período) — mesmo padrão de `fetchJumpParkRevenueCandidates`: o filtro de data acontece dentro de
 * `computeDreReport`, para reaproveitar a mesma busca entre múltiplos relatórios sem repetir a
 * consulta a cada período.
 *
 * Nunca grava nada — recalculada a cada chamada a partir do mesmo dado que já alimenta a tela
 * "Custo real Stone por venda"; uma sincronização nova aparece automaticamente na próxima consulta
 * da DRE, sem nenhuma ação adicional.
 */
export async function fetchStoneFeeCandidatesForDre(): Promise<StoneFeeCandidateInput[]> {
  const repo = getStonePersistenceRepository();
  const records = await repo.listNormalizedTransactionsByCapturedDateRange("2000-01-01", "2100-01-01");
  const dailyRows = buildDailyCostBreakdown(records);

  return dailyRows.map((day) => ({
    date: day.date,
    mdrAmount: day.mdrFeeTotal,
    mdrRowsCount: day.mdrRowsCount,
    advanceFeeAmount: day.advanceFeeConfirmedTotal,
    advanceRowsCount: day.advanceRowsCount,
  }));
}
