import { describe, expect, it } from "vitest";
import { baselineRecommendations, generateRecommendations, recommendationFromDiagnostic } from "@/lib/finance/intelligence/recommendations/engine";
import { compareMetricSets } from "@/lib/finance/intelligence/trends/engine";
import { runDiagnostics } from "@/lib/finance/intelligence/diagnostics/engine";
import type { Diagnostic, FinancialMetricSet } from "@/lib/finance/intelligence/types";

function metricSet(overrides: Partial<FinancialMetricSet> = {}): FinancialMetricSet {
  return {
    periodFrom: "2026-07-01",
    periodTo: "2026-07-30",
    transactionCount: 50,
    grossRevenue: 5000,
    netRevenue: 4850,
    totalFees: 150,
    feePercentage: 3,
    averageTicket: 100,
    averageTransactionValue: 97,
    highestSale: 200,
    lowestSale: 50,
    topSalesConcentration: 20,
    brandDistribution: [],
    paymentMethodDistribution: [],
    installmentDistribution: [],
    dailyRevenue: [],
    weeklyRevenue: [],
    monthlyRevenue: [],
    pendingReceivablesAmount: 500,
    overdueReceivablesAmount: 100,
    settledReceivablesAmount: 4000,
    settledReceivablesPercentage: 87,
    averageSettlementDays: 1,
    advancedAmount: 200,
    advancedPercentage: 5,
    ...overrides,
  };
}

function diagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    id: "ticket_medio_caiu",
    severity: "warning",
    confidence: "medium",
    title: "Ticket médio caiu",
    description: "desc",
    reason: "reason",
    evidence: ["ev1"],
    recommendation: "Investigar o mix de vendas.",
    ...overrides,
  };
}

describe("recommendationFromDiagnostic", () => {
  it("converte severidade em prioridade/impacto", () => {
    expect(recommendationFromDiagnostic(diagnostic({ severity: "critical" })).priority).toBe("high");
    expect(recommendationFromDiagnostic(diagnostic({ severity: "warning" })).priority).toBe("medium");
    expect(recommendationFromDiagnostic(diagnostic({ severity: "info" })).priority).toBe("low");
  });

  it("reaproveita o texto do diagnóstico, nunca duplica a lógica", () => {
    const rec = recommendationFromDiagnostic(diagnostic({ recommendation: "Texto específico." }));
    expect(rec.text).toBe("Texto específico.");
  });

  it("mapeia categoria a partir do id do diagnóstico", () => {
    expect(recommendationFromDiagnostic(diagnostic({ id: "excesso_antecipacao" })).category).toBe("cash_flow");
    expect(recommendationFromDiagnostic(diagnostic({ id: "concentracao_elevada" })).category).toBe("risk");
  });
});

describe("baselineRecommendations", () => {
  it("período estável e sem recebíveis atrasados relevantes gera recomendações de linha de base", () => {
    const trends = compareMetricSets(metricSet(), metricSet());
    const recs = baselineRecommendations(metricSet(), trends, []);
    expect(recs.some((r) => r.text.includes("estável"))).toBe(true);
    expect(recs.some((r) => r.text.includes("confortável"))).toBe(true);
  });

  it("nunca gera recomendação de linha de base contradizendo um diagnóstico de alerta ativo", () => {
    const current = metricSet({ overdueReceivablesAmount: 1500 });
    const trends = compareMetricSets(current, metricSet());
    const alertDiagnostic = diagnostic({ id: "recebiveis_atrasados_cresceram", severity: "critical" });
    const recs = baselineRecommendations(current, trends, [alertDiagnostic]);
    expect(recs.some((r) => r.text.includes("confortável"))).toBe(false);
  });
});

describe("generateRecommendations — integração", () => {
  it("cada diagnóstico vira uma recomendação, ordenadas por prioridade", () => {
    const current = metricSet({ averageTicket: 80, feePercentage: 8 });
    const previous = metricSet({ averageTicket: 100, feePercentage: 3 });
    const trends = compareMetricSets(current, previous);
    const diagnostics = runDiagnostics(current, trends);
    const recs = generateRecommendations(current, trends, diagnostics);

    expect(recs.length).toBeGreaterThanOrEqual(diagnostics.length);
    const priorities = recs.map((r) => r.priority);
    const rank = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < priorities.length; i++) expect(rank[priorities[i]]).toBeGreaterThanOrEqual(rank[priorities[i - 1]]);
  });

  it("toda recomendação tem priority/impact/confidence/category/text", () => {
    const trends = compareMetricSets(metricSet(), metricSet());
    const recs = generateRecommendations(metricSet(), trends, []);
    for (const r of recs) {
      expect(r.priority).toBeTruthy();
      expect(r.impact).toBeTruthy();
      expect(r.confidence).toBeTruthy();
      expect(r.category).toBeTruthy();
      expect(r.text).toBeTruthy();
    }
  });

  it("nunca lança mesmo sem nenhum diagnóstico e métricas zeradas", () => {
    const zero = metricSet({ transactionCount: 0, overdueReceivablesAmount: 0, settledReceivablesAmount: 0, advancedPercentage: 0 });
    expect(() => generateRecommendations(zero, compareMetricSets(zero, zero), [])).not.toThrow();
  });
});
