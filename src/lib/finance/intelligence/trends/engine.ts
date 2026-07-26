import { average } from "@/lib/finance/intelligence/utils/money";
import type { FinancialMetricKey, FinancialMetricSet, MovingAveragePoint, TrendDirection, TrendResult } from "@/lib/finance/intelligence/types";

/**
 * Motor de tendências (Sprint 8, seção "TENDÊNCIAS") — puro, matemático, nunca IA. Compara duas
 * `FinancialMetricSet` (período atual vs. período anterior) métrica a métrica.
 */

/** Rótulo em português de cada métrica numérica de `FinancialMetricSet` — usado nas comparações. */
export const METRIC_LABELS: Record<FinancialMetricKey, string> = {
  transactionCount: "Quantidade de vendas",
  grossRevenue: "Receita bruta",
  netRevenue: "Receita líquida",
  totalFees: "Total de taxas",
  feePercentage: "Percentual de taxas",
  averageTicket: "Ticket médio",
  averageTransactionValue: "Valor médio por transação",
  highestSale: "Maior venda",
  lowestSale: "Menor venda",
  topSalesConcentration: "Concentração das maiores vendas",
  pendingReceivablesAmount: "Recebíveis futuros",
  overdueReceivablesAmount: "Recebíveis vencidos",
  settledReceivablesAmount: "Recebíveis liquidados",
  settledReceivablesPercentage: "Percentual liquidado",
  advancedAmount: "Valor antecipado",
  advancedPercentage: "Percentual antecipado",
};

export const ALL_TREND_METRICS = Object.keys(METRIC_LABELS) as FinancialMetricKey[];

/** Abaixo deste percentual absoluto de variação, a métrica é considerada estável — nunca "subindo"/"caindo" por ruído. */
const STABLE_THRESHOLD_PERCENT = 3;

export function trendDirection(percentageChange: number | null, absoluteChange: number): TrendDirection {
  if (percentageChange === null) {
    if (absoluteChange === 0) return "estavel";
    return absoluteChange > 0 ? "subindo" : "caindo";
  }
  if (Math.abs(percentageChange) < STABLE_THRESHOLD_PERCENT) return "estavel";
  return percentageChange > 0 ? "subindo" : "caindo";
}

/** `null` quando `previousValue` é 0 — variação percentual indefinida, nunca dividido por zero. */
export function percentageChangeOf(currentValue: number, previousValue: number): number | null {
  if (previousValue === 0) return null;
  return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 10000) / 100;
}

/** Compara um período atual com um anterior, métrica a métrica — `metrics` default é todas as métricas numéricas de `FinancialMetricSet`. */
export function compareMetricSets(current: FinancialMetricSet, previous: FinancialMetricSet, metrics: FinancialMetricKey[] = ALL_TREND_METRICS): TrendResult[] {
  return metrics.map((metric) => {
    const currentValue = current[metric];
    const previousValue = previous[metric];
    const absoluteChange = Math.round((currentValue - previousValue) * 100) / 100;
    const percentageChange = percentageChangeOf(currentValue, previousValue);
    return { metric, label: METRIC_LABELS[metric], currentValue, previousValue, absoluteChange, percentageChange, direction: trendDirection(percentageChange, absoluteChange) };
  });
}

export function findTrend(trends: TrendResult[], metric: FinancialMetricKey): TrendResult | null {
  return trends.find((t) => t.metric === metric) ?? null;
}

/**
 * Média móvel de uma série cronológica (Sprint 8, seção "TENDÊNCIAS") — `movingAverage` é `null`
 * enquanto a janela ainda não tem `windowSize` pontos. `series` deve já vir ordenada por data
 * crescente (mesmo contrato de `dailyRevenue`).
 */
export function computeMovingAverage(series: { date: string; value: number }[], windowSize: number): MovingAveragePoint[] {
  return series.map((point, index) => {
    if (index < windowSize - 1) return { date: point.date, value: point.value, movingAverage: null };
    const window = series.slice(index - windowSize + 1, index + 1);
    return { date: point.date, value: point.value, movingAverage: average(window.map((w) => w.value)) };
  });
}
