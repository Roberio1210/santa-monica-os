import type { AccountsPayableView, RecurringBillTemplate } from "@/lib/finance/types";

/**
 * Missão 29 (sistema gerencial completo) — agregações puras (sem I/O) para o módulo gerencial de
 * Despesas (`/financeiro/despesas`). Reaproveita `AccountsPayableView` (já denormalizada com
 * `categoryName`/`supplierName`) e `filterPayablesByCompetencePeriod`/`computeExpensesSummary`/
 * `buildExpenseRows`, já existentes e testados em `painel-gerencial/expenses.ts` — nunca duplica
 * essa lógica, só compõe cima dela.
 *
 * Definição de "fixa" vs "variável" (nenhum conceito novo inventado — deriva do que já existe no
 * schema de `recurring_bill_templates`):
 *   - Fixa: despesa recorrente (`recurringBillTemplateId` preenchido) cujo modelo tem
 *     `variableAmount = false` — mesmo valor a cada competência (ex.: aluguel, contabilidade).
 *   - Variável: tudo o mais — recorrente com `variableAmount = true` (ex.: água/energia, valor
 *     muda a cada competência) OU despesa avulsa/pontual (sem modelo de recorrência).
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function activeOnly(items: AccountsPayableView[]): AccountsPayableView[] {
  return items.filter((i) => i.computedStatus !== "cancelada");
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  total: number;
  share: number;
  items: AccountsPayableView[];
}

/** Agrupa por `categoryName`, do maior para o menor gasto. `share` = percentual do total do conjunto informado. */
export function groupByCategory(items: AccountsPayableView[]): CategoryBreakdown[] {
  const active = activeOnly(items);
  const total = active.reduce((sum, i) => sum + i.originalAmount, 0);
  const groups = new Map<string, AccountsPayableView[]>();
  for (const item of active) {
    const list = groups.get(item.categoryName) ?? [];
    list.push(item);
    groups.set(item.categoryName, list);
  }
  return Array.from(groups.entries())
    .map(([category, catItems]) => {
      const catTotal = round2(catItems.reduce((sum, i) => sum + i.originalAmount, 0));
      return { category, count: catItems.length, total: catTotal, share: total > 0 ? round2((catTotal / total) * 100) : 0, items: catItems };
    })
    .sort((a, b) => b.total - a.total);
}

export interface SupplierBreakdown {
  supplier: string;
  count: number;
  total: number;
  share: number;
  items: AccountsPayableView[];
}

/** Agrupa por `supplierName` — despesas sem fornecedor informado ficam de fora (nunca inventa um fornecedor). */
export function groupBySupplier(items: AccountsPayableView[]): SupplierBreakdown[] {
  const active = activeOnly(items).filter((i) => i.supplierName);
  const total = active.reduce((sum, i) => sum + i.originalAmount, 0);
  const groups = new Map<string, AccountsPayableView[]>();
  for (const item of active) {
    const key = item.supplierName as string;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .map(([supplier, supItems]) => {
      const supTotal = round2(supItems.reduce((sum, i) => sum + i.originalAmount, 0));
      return { supplier, count: supItems.length, total: supTotal, share: total > 0 ? round2((supTotal / total) * 100) : 0, items: supItems };
    })
    .sort((a, b) => b.total - a.total);
}

export interface FixedVariableSplit {
  fixed: { count: number; total: number; items: AccountsPayableView[] };
  variable: { count: number; total: number; items: AccountsPayableView[] };
}

/** `templateVariableById`: id do modelo -> `variableAmount`. Item sem `recurringBillTemplateId` (avulso) sempre cai em "variável". */
export function splitFixedVariable(items: AccountsPayableView[], templateVariableById: Map<string, boolean>): FixedVariableSplit {
  const active = activeOnly(items);
  const fixedItems: AccountsPayableView[] = [];
  const variableItems: AccountsPayableView[] = [];
  for (const item of active) {
    const isFixed = item.recurringBillTemplateId !== null && templateVariableById.get(item.recurringBillTemplateId) === false;
    (isFixed ? fixedItems : variableItems).push(item);
  }
  return {
    fixed: { count: fixedItems.length, total: round2(fixedItems.reduce((s, i) => s + i.originalAmount, 0)), items: fixedItems },
    variable: { count: variableItems.length, total: round2(variableItems.reduce((s, i) => s + i.originalAmount, 0)), items: variableItems },
  };
}

export interface RecurringVsOneOffSplit {
  recurring: { count: number; total: number; items: AccountsPayableView[] };
  oneOff: { count: number; total: number; items: AccountsPayableView[] };
}

export function splitRecurringVsOneOff(items: AccountsPayableView[]): RecurringVsOneOffSplit {
  const active = activeOnly(items);
  const recurringItems = active.filter((i) => i.recurringBillTemplateId !== null);
  const oneOffItems = active.filter((i) => i.recurringBillTemplateId === null);
  return {
    recurring: { count: recurringItems.length, total: round2(recurringItems.reduce((s, i) => s + i.originalAmount, 0)), items: recurringItems },
    oneOff: { count: oneOffItems.length, total: round2(oneOffItems.reduce((s, i) => s + i.originalAmount, 0)), items: oneOffItems },
  };
}

/** As N maiores despesas do conjunto, maior valor primeiro. */
export function topExpenses(items: AccountsPayableView[], limit = 10): AccountsPayableView[] {
  return [...activeOnly(items)].sort((a, b) => b.originalAmount - a.originalAmount).slice(0, limit);
}

export interface MonthlyExpensePoint {
  month: string;
  total: number;
  count: number;
}

/** Evolução mensal (últimos `monthsBack` meses terminando em `asOfMonth`, formato "YYYY-MM"), sempre em ordem cronológica — meses sem despesa aparecem com total 0 (nunca omitidos, para o gráfico não distorcer a leitura). */
export function monthlyEvolution(allItems: AccountsPayableView[], monthsBack: number, asOfMonth: string): MonthlyExpensePoint[] {
  const active = activeOnly(allItems);
  const totalsByMonth = new Map<string, { total: number; count: number }>();
  for (const item of active) {
    const month = item.competenceDate.slice(0, 7);
    const current = totalsByMonth.get(month) ?? { total: 0, count: 0 };
    current.total = round2(current.total + item.originalAmount);
    current.count += 1;
    totalsByMonth.set(month, current);
  }

  const [asOfYear, asOfMonthNum] = asOfMonth.split("-").map(Number);
  const points: MonthlyExpensePoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(asOfYear, asOfMonthNum - 1 - i, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = totalsByMonth.get(month);
    points.push({ month, total: bucket?.total ?? 0, count: bucket?.count ?? 0 });
  }
  return points;
}

/** Gasto médio por dia corrido do período (não por dia útil) — divide o total pelo número de dias entre `from` e `to`, inclusive. */
export function averageDailyExpense(total: number, from: string, to: string): number {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return days > 0 ? round2(total / days) : 0;
}

export interface RecurringTemplateDetail {
  template: RecurringBillTemplate;
  /** Instâncias reais já geradas (accounts_payable) deste modelo, mais recente primeiro. */
  instances: AccountsPayableView[];
  /** `template.amount` quando fixo; null quando `variableAmount` (o próprio modelo não tem um valor único). */
  expectedAmount: number | null;
  /** Valor da instância mais recente já gerada — null quando nunca foi gerada nenhuma. */
  lastRealizedAmount: number | null;
  lastCompetence: string | null;
  /** Diferença entre a última instância e a penúltima — null quando há menos de 2 instâncias. */
  variation: { amount: number; percent: number | null } | null;
}

/** Uma entrada por modelo de recorrência — histórico completo de instâncias já geradas, mais recente primeiro. */
export function buildRecurringTemplateDetails(templates: RecurringBillTemplate[], allItems: AccountsPayableView[]): RecurringTemplateDetail[] {
  return templates.map((template) => {
    const instances = activeOnly(allItems)
      .filter((i) => i.recurringBillTemplateId === template.id)
      .sort((a, b) => b.competenceDate.localeCompare(a.competenceDate));

    const lastRealizedAmount = instances[0]?.originalAmount ?? null;
    const lastCompetence = instances[0]?.competenceDate ?? null;
    const previousAmount = instances[1]?.originalAmount ?? null;

    const variation =
      lastRealizedAmount !== null && previousAmount !== null
        ? { amount: round2(lastRealizedAmount - previousAmount), percent: previousAmount !== 0 ? round2(((lastRealizedAmount - previousAmount) / previousAmount) * 100) : null }
        : null;

    return {
      template,
      instances,
      expectedAmount: template.variableAmount ? null : template.amount,
      lastRealizedAmount,
      lastCompetence,
      variation,
    };
  });
}
