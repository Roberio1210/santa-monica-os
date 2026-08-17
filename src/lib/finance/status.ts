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
 * `draft`, `cancelled` e `reversed` são decisões manuais — nunca recalculadas automaticamente.
 * Os demais status (`open`, `partially_paid`, `paid`, `overdue`) são derivados de
 * outstandingAmount e dueDate em relação a `asOfDate`, para que a tela sempre reflita a
 * realidade mesmo que o status gravado esteja desatualizado.
 */
export function computeAccountsReceivableStatus(
  item: Pick<AccountsReceivable, "status" | "outstandingAmount" | "receivedAmount" | "dueDate">,
  asOfDate: string,
): AccountsReceivableStatus {
  if (item.status === "draft" || item.status === "cancelled" || item.status === "reversed") return item.status;

  const isOverdue = item.dueDate < asOfDate;

  if (item.outstandingAmount <= 0) return "paid";
  if (item.receivedAmount > 0) return isOverdue ? "overdue" : "partially_paid";
  return isOverdue ? "overdue" : "open";
}

/**
 * Lançada quando um recebimento excede o saldo em aberto e `allowOverpayment` não foi
 * explicitamente confirmado — mesmo padrão de PayableOverpaymentError, para o lado receivable.
 */
export class ReceivableOverpaymentError extends Error {
  constructor(outstandingAmount: number, attemptedAmount: number) {
    super(`Recebimento de ${attemptedAmount} excede o saldo em aberto de ${outstandingAmount}. Confirmação explícita necessária.`);
    this.name = "ReceivableOverpaymentError";
  }
}

/** amount - fee, nunca negativo. Retorna amount quando fee é null (nenhuma taxa informada). */
export function computeNetAmount(amount: number, feeAmount: number | null): number {
  if (feeAmount === null) return amount;
  const net = amount - feeAmount;
  return Math.round((net > 0 ? net : 0) * 100) / 100;
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

export interface BankStatementBalanceResult {
  balance: number;
  /** Linhas reais que compõem o saldo (todo status exceto "ignorado" — ver comentário do enum em db/schema/bankStatement.ts: só é excluída com justificativa explícita gravada). */
  totalCount: number;
  /** Quantas dessas linhas já foram conciliadas (status "conciliado") — indicador de cobertura de CLASSIFICAÇÃO, não de saldo (o saldo já usa 100% das linhas reais). */
  classifiedCount: number;
  classifiedPercent: number | null;
  /** totalCount - classifiedCount — Missão V4.1. */
  unclassifiedCount: number;
  /** Soma do valor (módulo) das linhas ainda não conciliadas — Missão V4.1, Fase 5: nunca classifica automaticamente, só torna o volume pendente visível. */
  unclassifiedAmount: number;
  importPeriodFrom: string | null;
  importPeriodTo: string | null;
}

/**
 * Missão Financeiro V4.0 — saldo real de uma conta a partir do EXTRATO BANCÁRIO BRUTO
 * (`bank_statement_lines`), não apenas das linhas já convertidas em `cash_movements`. Achado da
 * auditoria: só 574 de 1.987 linhas do extrato Stone real viraram cash_movements (29%) — o
 * restante (sobretudo `recebimento_venda_stone`, a maior parte da receita real) nunca precisou de
 * classificação humana e por isso nunca foi confirmado. Usar só cash_movements como fonte de
 * saldo produzia um número artificialmente negativo, sem relação com a realidade financeira.
 *
 * "ignorado" é a única status excluída da soma (por definição, marcada só com justificativa
 * explícita — nunca é uma linha real descartada por acaso). Todas as outras (conciliado,
 * sugerido, nao_conciliado, a_classificar) representam dinheiro que realmente entrou/saiu, então
 * entram no saldo mesmo sem classificação — a classificação define O QUE é, não SE aconteceu.
 *
 * Nunca presume saldo inicial: o resultado é relativo ao início do período efetivamente
 * importado (`importPeriodFrom`), nunca um saldo "desde sempre" da conta real.
 */
export function computeAccountBalanceFromBankStatement(
  lines: { direction: "entrada" | "saida"; amount: number; status: "conciliado" | "sugerido" | "nao_conciliado" | "a_classificar" | "ignorado"; date: string }[],
): BankStatementBalanceResult {
  const real = lines.filter((l) => l.status !== "ignorado");
  const balance = Math.round(real.reduce((sum, l) => sum + (l.direction === "entrada" ? l.amount : -l.amount), 0) * 100) / 100;
  const unclassified = real.filter((l) => l.status !== "conciliado");
  const classifiedCount = real.length - unclassified.length;
  const dates = real.map((l) => l.date).sort();
  return {
    balance,
    totalCount: real.length,
    classifiedCount,
    classifiedPercent: real.length > 0 ? Math.round((classifiedCount / real.length) * 1000) / 10 : null,
    unclassifiedCount: unclassified.length,
    unclassifiedAmount: Math.round(unclassified.reduce((sum, l) => sum + l.amount, 0) * 100) / 100,
    importPeriodFrom: dates[0] ?? null,
    importPeriodTo: dates[dates.length - 1] ?? null,
  };
}

export interface AccountPeriodSummary {
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}

/**
 * Missão Financeiro V2.1 (Fase E) — saldo inicial (tudo antes do período) + entradas do período -
 * saídas do período = saldo final. "Entradas/saídas" aqui inclui transferências (elas movem
 * dinheiro de fato desta conta), distinto da nature usada na DRE (que nunca conta transferência
 * como receita/despesa) — os dois eixos são propositalmente independentes.
 */
export function computeAccountPeriodSummary(
  fixedFundAmount: number | null,
  cashMovements: { type: "entrada" | "saida"; amount: number; date: string }[],
  transfersIn: { amount: number; date: string }[],
  transfersOut: { amount: number; date: string }[],
  periodFrom: string,
  periodTo: string,
): AccountPeriodSummary {
  const before = (date: string) => date < periodFrom;
  const inRange = (date: string) => date >= periodFrom && date <= periodTo;

  const openingBalance = computeAccountBalance(fixedFundAmount, cashMovements.filter((m) => before(m.date)), transfersIn.filter((t) => before(t.date)), transfersOut.filter((t) => before(t.date)));

  const periodCashIn = cashMovements.filter((m) => m.type === "entrada" && inRange(m.date)).reduce((sum, m) => sum + m.amount, 0);
  const periodCashOut = cashMovements.filter((m) => m.type === "saida" && inRange(m.date)).reduce((sum, m) => sum + m.amount, 0);
  const periodTransfersIn = transfersIn.filter((t) => inRange(t.date)).reduce((sum, t) => sum + t.amount, 0);
  const periodTransfersOut = transfersOut.filter((t) => inRange(t.date)).reduce((sum, t) => sum + t.amount, 0);

  const totalIn = Math.round((periodCashIn + periodTransfersIn) * 100) / 100;
  const totalOut = Math.round((periodCashOut + periodTransfersOut) * 100) / 100;
  const closingBalance = Math.round((openingBalance + totalIn - totalOut) * 100) / 100;

  return { openingBalance, totalIn, totalOut, closingBalance };
}

/**
 * Quinto dia útil de uma competência (formato "YYYY-MM") — preparado para recorrências de
 * prestadores cujo vencimento é "5º dia útil", ainda não vinculado a nenhum modelo real. "Dia
 * útil" aqui exclui só sábado/domingo; feriados nacionais/estaduais/municipais não são
 * considerados nesta etapa, por não haver uma fonte confiável cadastrada no sistema.
 */
export function computeFifthBusinessDay(competenceMonth: string): string {
  const [year, month] = competenceMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  let businessDays = 0;
  while (true) {
    const dayOfWeek = date.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
      if (businessDays === 5) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
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
