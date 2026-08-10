import "server-only";
import { fetchServiceOrders, JumpParkNotConfiguredError, JumpParkRequestError } from "@/lib/integrations/jumppark/service";
import { isJumpParkConfigured } from "@/lib/config/env";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsPayableView } from "@/lib/finance/status";
import type { JumpParkOrderInput } from "@/lib/domain/operational";
import { comparePeriodValues, previousPeriodOf, saoPauloDateISO, type PeriodRange } from "@/lib/utils/timezone";
import { buildCustomerAggregates, buildManagementOrderRows, buildServiceAggregates, computeManagementIndicators, rankCustomersBySpend } from "@/lib/painel-gerencial/orders";
import { buildExpenseRows, computeExpensesSummary, filterPayablesByCompetencePeriod } from "@/lib/painel-gerencial/expenses";
import { buildFindings } from "@/lib/painel-gerencial/insights";
import type { PainelGerencialResult } from "@/lib/painel-gerencial/types";

/**
 * Único ponto de I/O do Painel Gerencial. Reaproveita `fetchServiceOrders` (JumpPark, sem
 * alteração) e `getFinanceRepository()` (Contas a Pagar, sem alteração) — não cria nenhuma nova
 * fonte de dado, não persiste nada. Roda em paralelo: ordens do período atual, ordens do período
 * anterior (comparação) e despesas.
 *
 * Missão 29 — `previousPeriodOf`/`comparePeriodValues` centralizados em `lib/utils/timezone.ts`
 * (reusados por outros módulos); este arquivo só monta as comparações específicas do Painel.
 */

function errorMessageFor(error: unknown): string {
  if (error instanceof JumpParkNotConfiguredError) return "JumpPark não configurado neste ambiente.";
  if (error instanceof JumpParkRequestError) {
    if (error.status === 401 || error.status === 403) return "As credenciais do JumpPark foram rejeitadas.";
    return `A API do JumpPark respondeu com erro (HTTP ${error.status}).`;
  }
  if (error instanceof Error && error.name === "AbortError") return "A API do JumpPark não respondeu a tempo (timeout).";
  return "A API do JumpPark não respondeu.";
}

async function fetchOrdersOrEmpty(from: string, to: string): Promise<{ orders: JumpParkOrderInput[]; error: string | null }> {
  try {
    const raw = await fetchServiceOrders(from, to);
    return { orders: raw as JumpParkOrderInput[], error: null };
  } catch (error) {
    return { orders: [], error: errorMessageFor(error) };
  }
}

export async function fetchPainelGerencial(period: PeriodRange): Promise<PainelGerencialResult> {
  const jumpparkConfigured = isJumpParkConfigured();
  const previous = previousPeriodOf(period);
  const today = saoPauloDateISO();

  const [currentFetch, previousFetch, payableItemsRaw] = await Promise.all([
    jumpparkConfigured ? fetchOrdersOrEmpty(period.from, period.to) : Promise.resolve({ orders: [], error: null }),
    jumpparkConfigured ? fetchOrdersOrEmpty(previous.from, previous.to) : Promise.resolve({ orders: [], error: null }),
    getFinanceRepository()
      .listAccountsPayable()
      .catch(() => []),
  ]);

  const payableViews = payableItemsRaw.map((item) => toAccountsPayableView(item, today));

  const currentRows = buildManagementOrderRows(currentFetch.orders);
  const previousRows = buildManagementOrderRows(previousFetch.orders);

  const indicators = computeManagementIndicators(currentRows);
  const previousIndicators = computeManagementIndicators(previousRows);

  const customers = rankCustomersBySpend(buildCustomerAggregates(currentRows));
  const previousCustomers = buildCustomerAggregates(previousRows);

  const services = buildServiceAggregates(currentRows);

  const currentPayables = filterPayablesByCompetencePeriod(payableViews, period.from, period.to);
  const previousPayables = filterPayablesByCompetencePeriod(payableViews, previous.from, previous.to);
  const expensesSummary = computeExpensesSummary(currentPayables);
  const previousExpensesSummary = computeExpensesSummary(previousPayables);

  const findings = buildFindings({
    periodLabel: period.label,
    currentRows,
    currentIndicators: indicators,
    previousIndicators,
    currentServices: services,
    currentCustomers: customers,
    previousCustomers,
    currentExpenses: expensesSummary,
    previousExpenses: previousExpensesSummary,
  });

  const previousOperationalResult = Math.round((previousIndicators.netRevenue - previousExpensesSummary.total) * 100) / 100;
  const operationalResult = Math.round((indicators.netRevenue - expensesSummary.total) * 100) / 100;

  return {
    period,
    previousPeriod: previous,
    jumpparkConfigured,
    jumpparkError: currentFetch.error,
    generatedAt: new Date().toISOString(),
    orders: currentRows,
    indicators,
    customers,
    services,
    expenses: {
      rows: buildExpenseRows(currentPayables),
      summary: expensesSummary,
    },
    operationalResult,
    comparison: {
      netRevenue: comparePeriodValues(indicators.netRevenue, previousIndicators.netRevenue),
      grossRevenue: comparePeriodValues(indicators.grossRevenue, previousIndicators.grossRevenue),
      ordersCount: comparePeriodValues(indicators.ordersCount, previousIndicators.ordersCount),
      customersCount: comparePeriodValues(indicators.customersCount, previousIndicators.customersCount),
      averageTicket: comparePeriodValues(indicators.averageTicket ?? 0, previousIndicators.averageTicket ?? 0),
      expensesTotal: comparePeriodValues(expensesSummary.total, previousExpensesSummary.total),
      operationalResult: comparePeriodValues(operationalResult, previousOperationalResult),
    },
    findings,
  };
}

export { previousPeriodOf };
