import "server-only";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { reconcileDailyStoneSettlement, type StoneSettlementReconciliationRow } from "@/lib/finance/bankStatement/stoneSettlementReconciliation";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import { addDaysIso } from "@/lib/utils/timezone";

/**
 * Missão Financeiro V6.2 (Fases 3/7/8) — orquestra I/O (busca vendas Stone + linhas do extrato já
 * classificadas) e aplica a conciliação pura (`stoneSettlementReconciliation.ts`). Único ponto que
 * a tela/relatório deve chamar — nunca monta a consulta na mão.
 */
export async function fetchStoneSettlementReconciliation(financialAccountId: string, periodFrom: string, periodTo: string): Promise<StoneSettlementReconciliationRow[]> {
  const stoneRepo = getStonePersistenceRepository();
  const bankRepo = getBankStatementRepository();

  const [transactions, bankLines] = await Promise.all([
    stoneRepo.listNormalizedTransactionsByCapturedDateRange(periodFrom, periodTo),
    // +1 dia: a liquidação de uma venda do último dia do período cai no extrato do dia seguinte.
    bankRepo.listLines({ financialAccountId, type: "recebimento_venda_stone", direction: "entrada", dateFrom: periodFrom, dateTo: addDaysIso(periodTo, 1) }),
  ]);

  const salesByDate = new Map<string, { grossCents: number; mdrCents: number; netCents: number }>();
  for (const t of transactions) {
    if (t.eventType !== "sale") continue;
    const date = t.capturedAt.slice(0, 10);
    const acc = salesByDate.get(date) ?? { grossCents: 0, mdrCents: 0, netCents: 0 };
    acc.grossCents += Math.round(t.grossAmount * 100);
    acc.mdrCents += Math.round((t.mdrAmountStone ?? t.feeAmount) * 100);
    acc.netCents += Math.round(t.netAmount * 100);
    salesByDate.set(date, acc);
  }

  const sales = [...salesByDate.entries()]
    .filter(([date]) => date >= periodFrom && date <= periodTo)
    .map(([date, acc]) => ({ date, grossAmount: acc.grossCents / 100, mdrAmount: acc.mdrCents / 100, netExpected: acc.netCents / 100 }));

  const bankSettlements = bankLines.map((l) => ({ date: l.date, amount: l.amount }));

  return reconcileDailyStoneSettlement(sales, bankSettlements);
}
