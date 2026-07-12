import type {
  AccountsPayable,
  AccountsPayableStatus,
  AccountsPayableView,
  AccountsReceivable,
  AccountsReceivableStatus,
  AccountsReceivableView,
  ContractValuePeriod,
} from "@/lib/finance/types";

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
 * Lançada quando um pagamento excede o saldo em aberto e `allowOverpayment` não foi
 * explicitamente confirmado (ver src/lib/finance/types.ts, RecordPayablePaymentInput).
 */
export class PayableOverpaymentError extends Error {
  constructor(outstandingAmount: number, attemptedAmount: number) {
    super(`Pagamento de ${attemptedAmount} excede o saldo em aberto de ${outstandingAmount}. Confirmação explícita necessária.`);
    this.name = "PayableOverpaymentError";
  }
}

/**
 * `rascunho` e `cancelada` são decisões manuais — nunca recalculadas automaticamente. Os demais
 * (`pendente`, `parcialmente_paga`, `paga`, `vencida`) são derivados de outstandingAmount e
 * dueDate em relação a `asOfDate`, mesmo padrão de computeAccountsReceivableStatus.
 */
export function computeAccountsPayableStatus(
  item: Pick<AccountsPayable, "status" | "outstandingAmount" | "paidAmount" | "dueDate">,
  asOfDate: string,
): AccountsPayableStatus {
  if (item.status === "rascunho" || item.status === "cancelada") return item.status;

  const isOverdue = item.dueDate < asOfDate;

  if (item.outstandingAmount <= 0) return "paga";
  if (item.paidAmount > 0) return isOverdue ? "vencida" : "parcialmente_paga";
  return isOverdue ? "vencida" : "pendente";
}

export function toAccountsPayableView(item: AccountsPayable, asOfDate: string): AccountsPayableView {
  const computedStatus = computeAccountsPayableStatus(item, asOfDate);
  return {
    ...item,
    computedStatus,
    isOverdue: computedStatus === "vencida",
  };
}

/**
 * Divide um valor em N parcelas iguais (a última absorve o resto do arredondamento, para que a
 * soma bata exatamente com originalAmount — nunca usa ponto flutuante impreciso: todo cálculo é
 * feito em centavos inteiros). Vencimentos avançam um mês por parcela a partir de firstDueDate.
 */
export function computeInstallments(
  originalAmount: number,
  installmentTotal: number,
  firstDueDate: string,
): { number: number; amount: number; dueDate: string }[] {
  if (installmentTotal < 1) throw new Error("installmentTotal deve ser >= 1");

  const totalCents = Math.round(originalAmount * 100);
  const baseCents = Math.floor(totalCents / installmentTotal);
  const remainderCents = totalCents - baseCents * installmentTotal;

  const installments: { number: number; amount: number; dueDate: string }[] = [];
  for (let i = 0; i < installmentTotal; i++) {
    const cents = baseCents + (i === installmentTotal - 1 ? remainderCents : 0);
    const dueDate = addMonths(firstDueDate, i);
    installments.push({ number: i + 1, amount: cents / 100, dueDate });
  }
  return installments;
}

function addMonths(dateIso: string, months: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/**
 * Saldo real de uma conta financeira: fundo fixo inicial (só "dinheiro") + soma de
 * cash_movements vinculados a ela + soma de account_transfers de/para ela. Nunca inventa um
 * saldo — se não há fundo fixo nem movimentos, o saldo é 0.
 */
export function computeAccountBalance(
  fixedFundAmount: number | null,
  cashMovements: { type: "entrada" | "saida"; amount: number }[],
  transfersIn: { amount: number }[],
  transfersOut: { amount: number }[],
): number {
  const opening = fixedFundAmount ?? 0;
  const cashDelta = cashMovements.reduce((sum, m) => sum + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const transfersInTotal = transfersIn.reduce((sum, t) => sum + t.amount, 0);
  const transfersOutTotal = transfersOut.reduce((sum, t) => sum + t.amount, 0);
  return Math.round((opening + cashDelta + transfersInTotal - transfersOutTotal) * 100) / 100;
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
