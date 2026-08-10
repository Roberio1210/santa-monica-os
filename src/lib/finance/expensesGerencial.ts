import "server-only";
import { fetchAccountsPayableOverview, fetchRecurringBillTemplates } from "@/lib/finance/service";
import { filterPayablesByCompetencePeriod, buildExpenseRows } from "@/lib/painel-gerencial/expenses";
import type { ExpenseRow } from "@/lib/painel-gerencial/types";
import type { AccountsPayableView } from "@/lib/finance/types";
import {
  averageDailyExpense,
  buildRecurringTemplateDetails,
  groupByCategory,
  groupBySupplier,
  monthlyEvolution,
  splitFixedVariable,
  splitRecurringVsOneOff,
  topExpenses as computeTopExpenses,
  type CategoryBreakdown,
  type FixedVariableSplit,
  type MonthlyExpensePoint,
  type RecurringTemplateDetail,
  type RecurringVsOneOffSplit,
  type SupplierBreakdown,
} from "@/lib/finance/expensesAnalytics";
import { comparePeriodValues, previousPeriodOf, saoPauloDateISO, type PeriodComparison, type PeriodRange } from "@/lib/utils/timezone";
import { getStorageMode, type StorageMode } from "@/lib/storage/mode";

/**
 * Missão 29 (sistema gerencial completo) — único ponto de I/O do módulo gerencial de Despesas
 * (`/financeiro/despesas`). Reaproveita `fetchAccountsPayableOverview`/`fetchRecurringBillTemplates`
 * (Contas a Pagar, sem alteração nenhuma) — nenhuma tabela nova, nenhuma segunda fonte de despesa.
 * Uma única leitura de "todas as contas a pagar de todos os tempos" alimenta tanto o período
 * selecionado quanto a evolução mensal (12 meses) e o histórico completo de recorrências — sem
 * repetir a consulta ao banco.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ExpensesOverview {
  total: number;
  count: number;
  averagePerExpense: number;
  averageDaily: number;
}

export interface ExpensesGerencialComparison {
  total: PeriodComparison;
  count: PeriodComparison;
  averageDaily: PeriodComparison;
}

export interface ExpensesGerencialResult {
  storageMode: StorageMode;
  period: PeriodRange;
  previousPeriod: { from: string; to: string };
  overview: ExpensesOverview;
  comparison: ExpensesGerencialComparison;
  byCategory: CategoryBreakdown[];
  bySupplier: SupplierBreakdown[];
  fixedVariable: FixedVariableSplit;
  recurringVsOneOff: RecurringVsOneOffSplit;
  topExpenses: AccountsPayableView[];
  monthlyEvolution: MonthlyExpensePoint[];
  recurringTemplates: RecurringTemplateDetail[];
  rows: ExpenseRow[];
  hasData: boolean;
}

function emptyOverview(): ExpensesOverview {
  return { total: 0, count: 0, averagePerExpense: 0, averageDaily: 0 };
}

function buildOverview(items: AccountsPayableView[], from: string, to: string): ExpensesOverview {
  const active = items.filter((i) => i.computedStatus !== "cancelada");
  const total = round2(active.reduce((sum, i) => sum + i.originalAmount, 0));
  const count = active.length;
  return {
    total,
    count,
    averagePerExpense: count > 0 ? round2(total / count) : 0,
    averageDaily: averageDailyExpense(total, from, to),
  };
}

export async function fetchExpensesGerencial(period: PeriodRange): Promise<ExpensesGerencialResult> {
  const today = saoPauloDateISO();
  const previous = previousPeriodOf(period);

  const [{ items: allItems }, templates] = await Promise.all([fetchAccountsPayableOverview(today), fetchRecurringBillTemplates()]);

  if (allItems.length === 0) {
    return {
      storageMode: getStorageMode(),
      period,
      previousPeriod: previous,
      overview: emptyOverview(),
      comparison: { total: comparePeriodValues(0, 0), count: comparePeriodValues(0, 0), averageDaily: comparePeriodValues(0, 0) },
      byCategory: [],
      bySupplier: [],
      fixedVariable: { fixed: { count: 0, total: 0, items: [] }, variable: { count: 0, total: 0, items: [] } },
      recurringVsOneOff: { recurring: { count: 0, total: 0, items: [] }, oneOff: { count: 0, total: 0, items: [] } },
      topExpenses: [],
      monthlyEvolution: monthlyEvolution([], 12, today.slice(0, 7)),
      recurringTemplates: buildRecurringTemplateDetails(templates, []),
      rows: [],
      hasData: false,
    };
  }

  const currentItems = filterPayablesByCompetencePeriod(allItems, period.from, period.to);
  const previousItems = filterPayablesByCompetencePeriod(allItems, previous.from, previous.to);

  const overview = buildOverview(currentItems, period.from, period.to);
  const previousOverview = buildOverview(previousItems, previous.from, previous.to);

  const templateVariableById = new Map(templates.map((t) => [t.id, t.variableAmount]));

  return {
    storageMode: getStorageMode(),
    period,
    previousPeriod: previous,
    overview,
    comparison: {
      total: comparePeriodValues(overview.total, previousOverview.total),
      count: comparePeriodValues(overview.count, previousOverview.count),
      averageDaily: comparePeriodValues(overview.averageDaily, previousOverview.averageDaily),
    },
    byCategory: groupByCategory(currentItems),
    bySupplier: groupBySupplier(currentItems),
    fixedVariable: splitFixedVariable(currentItems, templateVariableById),
    recurringVsOneOff: splitRecurringVsOneOff(currentItems),
    topExpenses: computeTopExpenses(currentItems, 10),
    monthlyEvolution: monthlyEvolution(allItems, 12, today.slice(0, 7)),
    recurringTemplates: buildRecurringTemplateDetails(templates, allItems),
    rows: buildExpenseRows(currentItems),
    hasData: currentItems.some((i) => i.computedStatus !== "cancelada"),
  };
}
