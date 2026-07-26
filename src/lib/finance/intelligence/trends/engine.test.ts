import { describe, expect, it } from "vitest";
import { compareMetricSets, computeMovingAverage, findTrend, percentageChangeOf, trendDirection } from "@/lib/finance/intelligence/trends/engine";
import type { FinancialMetricSet } from "@/lib/finance/intelligence/types";

function metricSet(overrides: Partial<FinancialMetricSet> = {}): FinancialMetricSet {
  return {
    periodFrom: "2026-07-01",
    periodTo: "2026-07-01",
    transactionCount: 10,
    grossRevenue: 1000,
    netRevenue: 970,
    totalFees: 30,
    feePercentage: 3,
    averageTicket: 100,
    averageTransactionValue: 97,
    highestSale: 200,
    lowestSale: 50,
    topSalesConcentration: 25,
    brandDistribution: [],
    paymentMethodDistribution: [],
    installmentDistribution: [],
    dailyRevenue: [],
    weeklyRevenue: [],
    monthlyRevenue: [],
    pendingReceivablesAmount: 100,
    overdueReceivablesAmount: 20,
    settledReceivablesAmount: 500,
    settledReceivablesPercentage: 80,
    averageSettlementDays: 1,
    advancedAmount: 50,
    advancedPercentage: 10,
    ...overrides,
  };
}

describe("trendDirection e percentageChangeOf", () => {
  it("variação abaixo de 3% é sempre estável", () => {
    expect(trendDirection(2.9, 5)).toBe("estavel");
    expect(trendDirection(-2.9, -5)).toBe("estavel");
  });

  it("variação positiva acima de 3% é subindo", () => {
    expect(trendDirection(10, 100)).toBe("subindo");
  });

  it("variação negativa acima de 3% é caindo", () => {
    expect(trendDirection(-10, -100)).toBe("caindo");
  });

  it("percentageChangeOf nunca divide por zero — null quando previousValue é 0", () => {
    expect(percentageChangeOf(100, 0)).toBeNull();
    expect(trendDirection(null, 100)).toBe("subindo");
    expect(trendDirection(null, 0)).toBe("estavel");
  });

  it("percentageChangeOf calcula a variação percentual real", () => {
    expect(percentageChangeOf(110, 100)).toBe(10);
    expect(percentageChangeOf(90, 100)).toBe(-10);
  });
});

describe("compareMetricSets", () => {
  it("compara duas FinancialMetricSet, métrica a métrica", () => {
    const current = metricSet({ netRevenue: 1100, transactionCount: 12 });
    const previous = metricSet({ netRevenue: 1000, transactionCount: 10 });
    const trends = compareMetricSets(current, previous, ["netRevenue", "transactionCount"]);

    const revenueTrend = findTrend(trends, "netRevenue");
    expect(revenueTrend).toMatchObject({ label: "Receita líquida", currentValue: 1100, previousValue: 1000, absoluteChange: 100, percentageChange: 10, direction: "subindo" });

    const countTrend = findTrend(trends, "transactionCount");
    expect(countTrend?.percentageChange).toBe(20);
  });

  it("default cobre todas as métricas numéricas de FinancialMetricSet", () => {
    const trends = compareMetricSets(metricSet(), metricSet());
    expect(trends.length).toBeGreaterThanOrEqual(16);
    expect(trends.every((t) => t.direction === "estavel")).toBe(true);
  });

  it("findTrend devolve null para métrica ausente do subconjunto pedido", () => {
    const trends = compareMetricSets(metricSet(), metricSet(), ["netRevenue"]);
    expect(findTrend(trends, "grossRevenue")).toBeNull();
  });
});

describe("computeMovingAverage", () => {
  it("movingAverage é null enquanto a janela não tem pontos suficientes", () => {
    const series = [
      { date: "2026-07-01", value: 10 },
      { date: "2026-07-02", value: 20 },
    ];
    const result = computeMovingAverage(series, 3);
    expect(result[0].movingAverage).toBeNull();
    expect(result[1].movingAverage).toBeNull();
  });

  it("calcula a média móvel corretamente a partir do ponto em que a janela se completa", () => {
    const series = [
      { date: "2026-07-01", value: 10 },
      { date: "2026-07-02", value: 20 },
      { date: "2026-07-03", value: 30 },
      { date: "2026-07-04", value: 60 },
    ];
    const result = computeMovingAverage(series, 3);
    expect(result[2].movingAverage).toBe(20); // média de 10,20,30
    expect(result[3].movingAverage).toBe(Math.round(((20 + 30 + 60) / 3) * 100) / 100);
  });
});
