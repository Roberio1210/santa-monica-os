import type { AccountsPayableView, FinancePaymentMethod } from "@/lib/finance/types";
import type { ExpenseRow, ExpensesSummary } from "@/lib/painel-gerencial/types";

/** Mesmos rótulos já usados em `components/finance/accounts-receivable-view.tsx`. */
const PAYMENT_METHOD_LABELS: Record<FinancePaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
  desconhecido: "Não informado",
};

/**
 * Agregações puras sobre Contas a Pagar já existentes (`@/lib/finance`) — nunca cria uma nova
 * fonte de despesa, nunca duplica persistência. "Gasto no período" usa `competenceDate`
 * (competência), o mesmo conceito já usado pelo DRE do módulo Financeiro.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function filterPayablesByCompetencePeriod(items: AccountsPayableView[], from: string, to: string): AccountsPayableView[] {
  return items.filter((item) => item.competenceDate >= from && item.competenceDate <= to);
}

/**
 * Validação Final — "resultado operacional" (faturamento − despesas) só é um número gerencial
 * real quando os DOIS lados da conta têm dado real: receita vinda de uma JumpPark configurada e
 * sem erro, e pelo menos uma despesa real lançada no período (ExpensesSummary.hasData). Sem isso,
 * `netRevenue - 0` (ou `0 - despesas`) pareceria um resultado real quando na verdade é só ausência
 * de dado de um dos dois lados — "ausência de dado ≠ zero" (regra absoluta do módulo).
 */
export function isOperationalResultCalculable(jumpparkConfigured: boolean, jumpparkError: string | null, expensesHasData: boolean): boolean {
  return jumpparkConfigured && jumpparkError === null && expensesHasData;
}

const STATUS_LABELS: Record<AccountsPayableView["computedStatus"], string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  parcialmente_paga: "Parcialmente paga",
  paga: "Paga",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export function buildExpenseRows(items: AccountsPayableView[]): ExpenseRow[] {
  return items
    .map((item) => ({
      id: item.id,
      date: item.competenceDate,
      description: item.description,
      category: item.categoryName,
      supplier: item.supplierName,
      amount: item.originalAmount,
      dueDate: item.dueDate,
      status: STATUS_LABELS[item.computedStatus],
      paymentMethod: PAYMENT_METHOD_LABELS[item.paymentMethod] ?? item.paymentMethod,
      source: item.source,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function computeExpensesSummary(items: AccountsPayableView[]): ExpensesSummary {
  const active = items.filter((i) => i.computedStatus !== "cancelada");
  const total = round2(active.reduce((sum, i) => sum + i.originalAmount, 0));

  const categoryTotals = new Map<string, number>();
  const supplierTotals = new Map<string, number>();
  for (const item of active) {
    categoryTotals.set(item.categoryName, round2((categoryTotals.get(item.categoryName) ?? 0) + item.originalAmount));
    if (item.supplierName) {
      supplierTotals.set(item.supplierName, round2((supplierTotals.get(item.supplierName) ?? 0) + item.originalAmount));
    }
  }

  const topOf = (map: Map<string, number>): { name: string; amount: number } | null => {
    let top: { name: string; amount: number } | null = null;
    for (const [name, amount] of map) {
      if (!top || amount > top.amount) top = { name, amount };
    }
    return top;
  };

  return {
    total,
    count: active.length,
    topCategory: topOf(categoryTotals),
    topSupplier: topOf(supplierTotals),
    overdueCount: active.filter((i) => i.computedStatus === "vencida").length,
    upcomingCount: active.filter((i) => i.computedStatus === "pendente" || i.computedStatus === "parcialmente_paga").length,
    paidCount: active.filter((i) => i.computedStatus === "paga").length,
    unpaidCount: active.filter((i) => i.computedStatus !== "paga").length,
    hasData: active.length > 0,
  };
}
