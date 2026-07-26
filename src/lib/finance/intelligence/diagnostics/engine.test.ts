import { describe, expect, it } from "vitest";
import { compareMetricSets } from "@/lib/finance/intelligence/trends/engine";
import {
  diagnoseAbnormalVolume,
  diagnoseExcessiveAdvance,
  diagnoseFeeIncrease,
  diagnoseHighConcentration,
  diagnoseOverdueGrowth,
  diagnoseRevenueGrowth,
  diagnoseSlowSettlement,
  diagnoseTicketDrop,
  runDiagnostics,
} from "@/lib/finance/intelligence/diagnostics/engine";
import type { FinancialMetricSet } from "@/lib/finance/intelligence/types";

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

describe("diagnostics/engine — regras individuais", () => {
  it("diagnoseTicketDrop dispara com queda >= 10%, nunca com queda pequena", () => {
    const current = metricSet({ averageTicket: 85 });
    const previous = metricSet({ averageTicket: 100 });
    const trends = compareMetricSets(current, previous, ["averageTicket"]);
    expect(diagnoseTicketDrop(current, trends)?.id).toBe("ticket_medio_caiu");

    const smallDrop = compareMetricSets(metricSet({ averageTicket: 96 }), previous, ["averageTicket"]);
    expect(diagnoseTicketDrop(current, smallDrop)).toBeNull();
  });

  it("diagnoseRevenueGrowth dispara quando netRevenue sobe", () => {
    const current = metricSet({ netRevenue: 6000 });
    const previous = metricSet({ netRevenue: 5000 });
    const trends = compareMetricSets(current, previous, ["netRevenue"]);
    expect(diagnoseRevenueGrowth(current, trends)?.severity).toBe("info");
  });

  it("diagnoseFeeIncrease dispara quando o percentual de taxas sobe além do limite", () => {
    const current = metricSet({ feePercentage: 8 });
    const previous = metricSet({ feePercentage: 3 });
    const trends = compareMetricSets(current, previous, ["feePercentage"]);
    expect(diagnoseFeeIncrease(current, trends)?.id).toBe("taxas_aumentaram");
  });

  it("diagnoseOverdueGrowth dispara e vira critical quando vencidos superam 20% do liquidado", () => {
    const current = metricSet({ overdueReceivablesAmount: 1500, settledReceivablesAmount: 4000 });
    const previous = metricSet({ overdueReceivablesAmount: 100 });
    const trends = compareMetricSets(current, previous, ["overdueReceivablesAmount"]);
    const diagnostic = diagnoseOverdueGrowth(current, trends);
    expect(diagnostic?.severity).toBe("critical");
  });

  it("diagnoseSlowSettlement dispara acima de 2 dias de prazo médio, nunca abaixo", () => {
    expect(diagnoseSlowSettlement(metricSet({ averageSettlementDays: 3 }))?.id).toBe("liquidacao_lenta");
    expect(diagnoseSlowSettlement(metricSet({ averageSettlementDays: 1 }))).toBeNull();
    expect(diagnoseSlowSettlement(metricSet({ averageSettlementDays: null }))).toBeNull();
  });

  it("diagnoseExcessiveAdvance dispara acima de 30% antecipado", () => {
    expect(diagnoseExcessiveAdvance(metricSet({ advancedPercentage: 35 }))?.id).toBe("excesso_antecipacao");
    expect(diagnoseExcessiveAdvance(metricSet({ advancedPercentage: 10 }))).toBeNull();
  });

  it("diagnoseHighConcentration dispara acima de 50%", () => {
    expect(diagnoseHighConcentration(metricSet({ topSalesConcentration: 60 }))?.id).toBe("concentracao_elevada");
    expect(diagnoseHighConcentration(metricSet({ topSalesConcentration: 20 }))).toBeNull();
  });

  it("diagnoseAbnormalVolume distingue acima/abaixo da média", () => {
    const above = compareMetricSets(metricSet({ transactionCount: 80 }), metricSet({ transactionCount: 50 }), ["transactionCount"]);
    expect(diagnoseAbnormalVolume(metricSet({ transactionCount: 80 }), above)?.id).toBe("volume_acima_da_media");

    const below = compareMetricSets(metricSet({ transactionCount: 20 }), metricSet({ transactionCount: 50 }), ["transactionCount"]);
    expect(diagnoseAbnormalVolume(metricSet({ transactionCount: 20 }), below)?.id).toBe("volume_abaixo_da_media");
  });

  it("todo diagnóstico traz id/severity/confidence/title/description/reason/evidence/recommendation", () => {
    const current = metricSet({ averageTicket: 80 });
    const previous = metricSet({ averageTicket: 100 });
    const trends = compareMetricSets(current, previous, ["averageTicket"]);
    const diagnostic = diagnoseTicketDrop(current, trends)!;
    expect(diagnostic.id).toBeTruthy();
    expect(diagnostic.severity).toBeTruthy();
    expect(diagnostic.confidence).toBeTruthy();
    expect(diagnostic.title).toBeTruthy();
    expect(diagnostic.description).toBeTruthy();
    expect(diagnostic.reason).toBeTruthy();
    expect(diagnostic.evidence.length).toBeGreaterThan(0);
    expect(diagnostic.recommendation).toBeTruthy();
  });

  it("amostra pequena (poucas vendas) nunca produz confiança alta", () => {
    const current = metricSet({ averageTicket: 80, transactionCount: 2 });
    const previous = metricSet({ averageTicket: 100, transactionCount: 2 });
    const trends = compareMetricSets(current, previous, ["averageTicket"]);
    expect(diagnoseTicketDrop(current, trends)?.confidence).toBe("low");
  });
});

describe("runDiagnostics — combina todas as regras", () => {
  it("período estável e saudável não produz nenhum diagnóstico de alerta", () => {
    const trends = compareMetricSets(metricSet(), metricSet());
    const diagnostics = runDiagnostics(metricSet(), trends);
    expect(diagnostics.every((d) => d.severity !== "critical")).toBe(true);
  });

  it("combina múltiplos diagnósticos simultâneos sem perder nenhum", () => {
    const current = metricSet({ averageTicket: 80, feePercentage: 8, topSalesConcentration: 60 });
    const previous = metricSet({ averageTicket: 100, feePercentage: 3 });
    const trends = compareMetricSets(current, previous);
    const diagnostics = runDiagnostics(current, trends);
    const ids = diagnostics.map((d) => d.id);
    expect(ids).toContain("ticket_medio_caiu");
    expect(ids).toContain("taxas_aumentaram");
    expect(ids).toContain("concentracao_elevada");
  });

  it("nunca lança mesmo com métricas totalmente zeradas", () => {
    const zero = metricSet({ transactionCount: 0, grossRevenue: 0, netRevenue: 0, averageTicket: 0, feePercentage: 0, averageSettlementDays: null, advancedPercentage: 0, topSalesConcentration: 0 });
    expect(() => runDiagnostics(zero, compareMetricSets(zero, zero))).not.toThrow();
  });
});
