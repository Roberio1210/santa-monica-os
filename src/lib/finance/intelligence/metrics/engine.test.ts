import { describe, expect, it } from "vitest";
import {
  averageSettlementDays,
  averageTicket,
  averageTransactionValue,
  brandDistribution,
  computeFinancialMetrics,
  dailyRevenue,
  feePercentage,
  highestSale,
  installmentDistribution,
  lowestSale,
  monthlyRevenue,
  netRevenue,
  paymentMethodDistribution,
  topSalesConcentration,
  totalFees,
  totalRevenue,
  weeklyRevenue,
} from "@/lib/finance/intelligence/metrics/engine";
import type { NormalizedConciliation, NormalizedSaleTransaction } from "@/lib/integrations/stone/normalize";
import type { FinancialPeriodInput } from "@/lib/finance/intelligence/types";

function sale(overrides: Partial<NormalizedSaleTransaction> = {}): NormalizedSaleTransaction {
  return {
    acquirerTransactionKey: overrides.acquirerTransactionKey ?? `nsu-${Math.random()}`,
    authorizationCode: "AUTH",
    authorizedAt: "2026-07-01T10:00:00Z",
    capturedAt: "2026-07-01T10:00:00Z",
    cardFlow: "credito",
    installmentsCount: 1,
    grossAmount: 100,
    netAmount: 97,
    feeAmount: 3,
    brandId: 1,
    terminalSerialNumber: null,
    cancellations: [],
    raw: {} as NormalizedSaleTransaction["raw"],
    ...overrides,
  };
}

function day(overrides: Partial<NormalizedConciliation> = {}): NormalizedConciliation {
  return {
    referenceDate: "2026-07-01",
    generationDateTime: "2026-07-02T05:00:00Z",
    establishmentCode: "EST1",
    layout: "XML2_4",
    sales: [],
    chargebacks: [],
    chargebackRefunds: [],
    expectedPayments: [],
    realizedPayments: [],
    advances: [],
    settlements: [],
    financialPositions: [],
    financialEvents: [],
    terminalSerialNumbers: [],
    ...overrides,
  };
}

function periodInput(days: NormalizedConciliation[], overrides: Partial<FinancialPeriodInput> = {}): FinancialPeriodInput {
  return { periodFrom: "2026-07-01", periodTo: "2026-07-01", days, todayIso: "2026-07-05", dataAvailableThroughDate: "2026-07-04", ...overrides };
}

describe("metrics/engine — funções puras individuais", () => {
  it("totalRevenue e netRevenue somam em centavos, nunca float impreciso", () => {
    const sales = [{ grossAmount: 10.1 }, { grossAmount: 20.2 }, { grossAmount: 0.3 }];
    expect(totalRevenue(sales)).toBeCloseTo(30.6, 10);
  });

  it("netRevenue soma o valor líquido, não o bruto", () => {
    expect(netRevenue([{ netAmount: 97 }, { netAmount: 48 }])).toBe(145);
  });

  it("totalFees soma as taxas", () => {
    expect(totalFees([{ feeAmount: 3 }, { feeAmount: 1.5 }])).toBe(4.5);
  });

  it("feePercentage — 0-100, nunca divide por zero", () => {
    expect(feePercentage(100, 3)).toBe(3);
    expect(feePercentage(0, 0)).toBe(0);
  });

  it("averageTicket e averageTransactionValue — médias distintas (bruto vs líquido)", () => {
    const sales = [{ grossAmount: 100, netAmount: 97 }, { grossAmount: 200, netAmount: 194 }];
    expect(averageTicket(sales)).toBe(150);
    expect(averageTransactionValue(sales)).toBe(145.5);
  });

  it("averageTicket de lista vazia é 0, nunca NaN", () => {
    expect(averageTicket([])).toBe(0);
  });

  it("highestSale e lowestSale", () => {
    const sales = [{ grossAmount: 50 }, { grossAmount: 500 }, { grossAmount: 10 }];
    expect(highestSale(sales)).toBe(500);
    expect(lowestSale(sales)).toBe(10);
  });

  it("highestSale/lowestSale de lista vazia são 0", () => {
    expect(highestSale([])).toBe(0);
    expect(lowestSale([])).toBe(0);
  });

  it("topSalesConcentration — participação dos ~10% maiores na receita total", () => {
    const sales = Array.from({ length: 10 }, (_, i) => ({ grossAmount: i === 0 ? 910 : 10 })); // 1 venda de 910 + 9 de 10 = total 1000
    expect(topSalesConcentration(sales)).toBe(91);
  });

  it("topSalesConcentration com uma única venda é 100%", () => {
    expect(topSalesConcentration([{ grossAmount: 100 }])).toBe(100);
  });

  it("brandDistribution agrupa por bandeira com rótulo legível", () => {
    const sales = [{ grossAmount: 100, brandId: 1 }, { grossAmount: 50, brandId: 1 }, { grossAmount: 30, brandId: 2 }];
    const dist = brandDistribution(sales);
    expect(dist[0]).toMatchObject({ key: "1", label: "Visa", count: 2, amount: 150 });
    expect(dist[1]).toMatchObject({ key: "2", label: "Mastercard", count: 1, amount: 30 });
  });

  it("paymentMethodDistribution agrupa débito vs crédito", () => {
    const sales = [{ grossAmount: 100, cardFlow: "debito" }, { grossAmount: 200, cardFlow: "credito" }];
    const dist = paymentMethodDistribution(sales);
    expect(dist.find((d) => d.key === "debito")?.label).toBe("Débito");
    expect(dist.find((d) => d.key === "credito")?.label).toBe("Crédito");
  });

  it("installmentDistribution rotula 1x como 'À vista'", () => {
    const sales = [{ grossAmount: 100, installmentsCount: 1 }, { grossAmount: 200, installmentsCount: 3 }];
    const dist = installmentDistribution(sales);
    expect(dist.find((d) => d.key === "1")?.label).toBe("À vista");
    expect(dist.find((d) => d.key === "3")?.label).toBe("3x");
  });

  it("dailyRevenue agrupa por data (capturedAt), ordenado crescente", () => {
    const sales = [
      { grossAmount: 100, netAmount: 97, capturedAt: "2026-07-02T10:00:00Z" },
      { grossAmount: 50, netAmount: 48, capturedAt: "2026-07-01T10:00:00Z" },
      { grossAmount: 30, netAmount: 29, capturedAt: "2026-07-01T15:00:00Z" },
    ];
    const daily = dailyRevenue(sales);
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({ date: "2026-07-01", grossAmount: 80, transactionCount: 2 });
    expect(daily[1]).toMatchObject({ date: "2026-07-02", grossAmount: 100, transactionCount: 1 });
  });

  it("weeklyRevenue e monthlyRevenue agregam a partir da série diária", () => {
    const daily = dailyRevenue([
      { grossAmount: 100, netAmount: 97, capturedAt: "2026-07-01T10:00:00Z" },
      { grossAmount: 50, netAmount: 48, capturedAt: "2026-07-15T10:00:00Z" },
    ]);
    expect(monthlyRevenue(daily)).toEqual([{ key: "2026-07", label: "2026-07", count: 2, amount: 150, percentageOfTotal: 100 }]);
    expect(weeklyRevenue(daily).length).toBeGreaterThan(0);
  });

  it("averageSettlementDays — média de dias entre previsão e liquidação real", () => {
    const records = [
      { netAmount: 100, expectedPaymentDate: "2026-07-01", settledPaymentDate: "2026-07-03", settledAmount: 97, isAdvance: false, state: "settled_on_time" as const },
      { netAmount: 100, expectedPaymentDate: "2026-07-01", settledPaymentDate: "2026-07-02", settledAmount: 97, isAdvance: false, state: "settled_on_time" as const },
    ];
    expect(averageSettlementDays(records)).toBe(1.5);
  });

  it("averageSettlementDays é null quando nenhuma parcela liquidada tem as duas datas", () => {
    expect(averageSettlementDays([])).toBeNull();
  });
});

describe("computeFinancialMetrics — integração completa", () => {
  it("período sem vendas devolve um FinancialMetricSet honesto, tudo zerado, nunca lança", () => {
    const metrics = computeFinancialMetrics(periodInput([]));
    expect(metrics.transactionCount).toBe(0);
    expect(metrics.grossRevenue).toBe(0);
    expect(metrics.averageTicket).toBe(0);
    expect(metrics.averageSettlementDays).toBeNull();
    expect(metrics.brandDistribution).toEqual([]);
  });

  it("calcula receita, ticket médio e distribuição a partir de um dia real", () => {
    const d = day({
      referenceDate: "2026-07-01",
      sales: [sale({ acquirerTransactionKey: "s1", grossAmount: 100, netAmount: 97, feeAmount: 3, brandId: 1, cardFlow: "credito" }), sale({ acquirerTransactionKey: "s2", grossAmount: 200, netAmount: 194, feeAmount: 6, brandId: 2, cardFlow: "debito" })],
    });
    const metrics = computeFinancialMetrics(periodInput([d]));
    expect(metrics.transactionCount).toBe(2);
    expect(metrics.grossRevenue).toBe(300);
    expect(metrics.netRevenue).toBe(291);
    expect(metrics.totalFees).toBe(9);
    expect(metrics.averageTicket).toBe(150);
    expect(metrics.brandDistribution).toHaveLength(2);
    expect(metrics.paymentMethodDistribution).toHaveLength(2);
  });

  it("classifica recebíveis futuros, vencidos e liquidados a partir de expectedPayments/settlements", () => {
    const d = day({
      referenceDate: "2026-07-01",
      expectedPayments: [
        { saleExternalReference: "s1", installmentNumber: 1, grossAmount: 100, amount: 97, expectedPaymentDate: "2026-07-10" }, // futuro (dataAvailableThroughDate=2026-07-04)
        { saleExternalReference: "s2", installmentNumber: 1, grossAmount: 50, amount: 48, expectedPaymentDate: "2026-07-02" }, // vencido, sem liquidação
        { saleExternalReference: "s3", installmentNumber: 1, grossAmount: 30, amount: 29, expectedPaymentDate: "2026-07-01" }, // liquidado
      ],
      settlements: [{ saleExternalReference: "s3", installmentNumber: 1, netAmount: 29, settledPaymentDate: "2026-07-01", isAdvance: false }],
    });
    const metrics = computeFinancialMetrics(periodInput([d]));
    expect(metrics.pendingReceivablesAmount).toBe(97);
    expect(metrics.overdueReceivablesAmount).toBe(48);
    expect(metrics.settledReceivablesAmount).toBe(29);
    expect(metrics.settledReceivablesPercentage).toBeCloseTo((29 / (29 + 48 + 97)) * 100, 1);
  });

  it("valor antecipado e percentual antecipado a partir de settlements com isAdvance", () => {
    const d = day({
      referenceDate: "2026-07-01",
      expectedPayments: [
        { saleExternalReference: "s1", installmentNumber: 1, grossAmount: 100, amount: 97, expectedPaymentDate: "2026-07-20" },
        { saleExternalReference: "s2", installmentNumber: 1, grossAmount: 50, amount: 48, expectedPaymentDate: "2026-07-01" },
      ],
      settlements: [
        { saleExternalReference: "s1", installmentNumber: 1, netAmount: 95, settledPaymentDate: "2026-07-02", isAdvance: true },
        { saleExternalReference: "s2", installmentNumber: 1, netAmount: 48, settledPaymentDate: "2026-07-01", isAdvance: false },
      ],
    });
    const metrics = computeFinancialMetrics(periodInput([d]));
    expect(metrics.advancedAmount).toBe(95);
    expect(metrics.settledReceivablesAmount).toBe(143);
    expect(metrics.advancedPercentage).toBeCloseTo((95 / 143) * 100, 1);
  });

  it("cancelamento total nunca conta como recebível vencido/futuro/liquidado", () => {
    const d = day({
      referenceDate: "2026-07-01",
      sales: [sale({ acquirerTransactionKey: "s1", cancellations: [{ operationKey: "c1", installmentNumber: null, amount: 100, occurredAt: "2026-07-02T00:00:00Z" }] })],
      expectedPayments: [{ saleExternalReference: "s1", installmentNumber: 1, grossAmount: 100, amount: 97, expectedPaymentDate: "2026-07-02" }],
    });
    const metrics = computeFinancialMetrics(periodInput([d]));
    expect(metrics.pendingReceivablesAmount).toBe(0);
    expect(metrics.overdueReceivablesAmount).toBe(0);
    expect(metrics.settledReceivablesAmount).toBe(0);
  });
});
