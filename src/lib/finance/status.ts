import type { AccountsReceivable, AccountsReceivableStatus, AccountsReceivableView, ContractValuePeriod } from "@/lib/finance/types";

/** expectedAmount - receivedAmount, nunca negativo (pagamento a mais não gera saldo negativo aqui). */
export function computeOutstanding(expectedAmount: number, receivedAmount: number): number {
  const outstanding = expectedAmount - receivedAmount;
  return outstanding > 0 ? Math.round(outstanding * 100) / 100 : 0;
}

/**
 * `draft` e `cancelled` são decisões manuais — nunca recalculadas automaticamente. Os demais
 * status (`open`, `partially_paid`, `paid`, `overdue`) são derivados de outstandingAmount e
 * dueDate em relação a `asOfDate`, para que a tela sempre reflita a realidade mesmo que o
 * status gravado esteja desatualizado.
 */
export function computeAccountsReceivableStatus(
  item: Pick<AccountsReceivable, "status" | "outstandingAmount" | "receivedAmount" | "dueDate">,
  asOfDate: string,
): AccountsReceivableStatus {
  if (item.status === "draft" || item.status === "cancelled") return item.status;

  const isOverdue = item.dueDate < asOfDate;

  if (item.outstandingAmount <= 0) return "paid";
  if (item.receivedAmount > 0) return isOverdue ? "overdue" : "partially_paid";
  return isOverdue ? "overdue" : "open";
}

export function toAccountsReceivableView(item: AccountsReceivable, asOfDate: string): AccountsReceivableView {
  const computedStatus = computeAccountsReceivableStatus(item, asOfDate);
  return {
    ...item,
    computedStatus,
    isOverdue: computedStatus === "overdue",
  };
}

/**
 * Retorna o valor vigente de um contrato numa data específica, a partir das vigências
 * cadastradas (contract_value_periods). Retorna null quando nenhuma vigência cobre a data —
 * nunca inventa um valor para uma lacuna (ex.: Don Juan entre 16/07/2026 e 14/08/2026).
 */
export function resolveContractValue(periods: ContractValuePeriod[], onDate: string): number | null {
  for (const period of periods) {
    const afterStart = period.effectiveFrom === null || period.effectiveFrom <= onDate;
    const beforeEnd = period.effectiveUntil === null || onDate <= period.effectiveUntil;
    if (afterStart && beforeEnd) return period.amount;
  }
  return null;
}
