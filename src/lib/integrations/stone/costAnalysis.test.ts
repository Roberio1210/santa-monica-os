import { describe, expect, it } from "vitest";
import {
  classifyModality,
  computeInstallmentAdvanceFee,
  summarizePeriodCost,
  buildDailyCostBreakdown,
  buildModalityCostBreakdown,
  buildTransactionDetailRows,
  findWorstCostDay,
} from "@/lib/integrations/stone/costAnalysis";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

let counter = 0;

function makeRecord(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  counter += 1;
  return {
    externalKey: `key-${counter}`,
    acquirerTransactionKey: `atk-${counter}`,
    authorizationCode: `auth-${counter}`,
    initiatorTransactionKey: null,
    establishmentCode: "estabelecimento-1",
    terminalSerialNumber: null,
    capturedAt: "2026-08-10T12:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 100,
    feeAmount: 3,
    netAmount: 97,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "scheduled",
    expectedPaymentDate: "2026-08-15",
    settledPaymentDate: null,
    settledAmount: null,
    sourceFile: "estabelecimento-1-20260810-XML2_4-without_reversals.xml",
    importRunId: "run-1",
    ...overrides,
  };
}

describe("classifyModality", () => {
  it("mapeia débito/crédito reais e bandeira via brandId", () => {
    const modality = classifyModality(makeRecord({ paymentMethod: "credito", brandId: "1", installmentNumber: 3 }));
    expect(modality).toEqual({ method: "credito", brand: "visa_mastercard", installments: 3 });
  });

  it("qualquer paymentMethod fora de debito/credito vira 'outro' (nunca inventa uma modalidade)", () => {
    const modality = classifyModality(makeRecord({ paymentMethod: "boleto" }));
    expect(modality.method).toBe("outro");
  });

  it("brandId fora da tabela conhecida -> brand null, nunca inventado", () => {
    const modality = classifyModality(makeRecord({ brandId: "9999" }));
    expect(modality.brand).toBeNull();
  });
});

describe("computeInstallmentAdvanceFee", () => {
  it("settledAmount presente -> antecipação = netAmount - settledAmount", () => {
    const fee = computeInstallmentAdvanceFee(makeRecord({ netAmount: 97, settledAmount: 95.5 }));
    expect(fee).toBeCloseTo(1.5, 2);
  });

  it("settledAmount ausente -> null, nunca estimado", () => {
    const fee = computeInstallmentAdvanceFee(makeRecord({ settledAmount: null }));
    expect(fee).toBeNull();
  });

  it("arredondamento em centavos evita erro de ponto flutuante (0.1 + 0.2 style)", () => {
    const fee = computeInstallmentAdvanceFee(makeRecord({ netAmount: 100.3, settledAmount: 100.1 }));
    expect(fee).toBe(0.2);
  });
});

describe("summarizePeriodCost", () => {
  it("MDR sempre confirmado; antecipação 'completo' quando 100% das parcelas de venda têm liquidação", () => {
    const records = [
      makeRecord({ grossAmount: 100, feeAmount: 3, netAmount: 97, settledAmount: 95.5 }),
      makeRecord({ grossAmount: 200, feeAmount: 6, netAmount: 194, settledAmount: 192 }),
    ];
    const summary = summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(summary.installmentRowsCount).toBe(2);
    expect(summary.salesCount).toBe(2);
    expect(summary.grossAmountTotal).toBe(300);
    expect(summary.mdrFeeTotal).toBe(9);
    expect(summary.advanceDataStatus).toBe("completo");
    expect(summary.advanceFeeConfirmedTotal).toBeCloseTo(1.5 + 2, 2);
    expect(summary.totalConfirmedCost).toBeCloseTo(9 + 3.5, 2);
    expect(summary.effectiveTotalRatePercent).not.toBeNull();
  });

  it("cobertura parcial -> status 'parcial', taxa efetiva total é null (nunca uma taxa parcial disfarçada de total)", () => {
    const records = [makeRecord({ settledAmount: 95.5 }), makeRecord({ settledAmount: null })];
    const summary = summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(summary.advanceDataStatus).toBe("parcial");
    expect(summary.unsettledRowsCount).toBe(1);
    expect(summary.effectiveTotalRatePercent).toBeNull();
    // MDR nunca deixa de ser reportado, mesmo sem liquidação de nenhuma parcela.
    expect(summary.effectiveMdrRatePercent).not.toBeNull();
  });

  it("nenhuma parcela liquidada -> status 'indisponivel', antecipação zerada mas MDR intacto", () => {
    const records = [makeRecord({ settledAmount: null }), makeRecord({ settledAmount: null })];
    const summary = summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(summary.advanceDataStatus).toBe("indisponivel");
    expect(summary.advanceFeeConfirmedTotal).toBe(0);
    expect(summary.totalConfirmedCost).toBe(summary.mdrFeeTotal);
    expect(summary.totalConfirmedCostLabel).toContain("apenas MDR");
  });

  it("cancelamentos e chargebacks nunca entram nos totais principais — reportados à parte", () => {
    const records = [
      makeRecord({ eventType: "sale", grossAmount: 100, feeAmount: 3 }),
      makeRecord({ eventType: "cancellation", grossAmount: 50, feeAmount: 1.5 }),
      makeRecord({ eventType: "chargeback", grossAmount: 80, feeAmount: 2.4 }),
    ];
    const summary = summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(summary.installmentRowsCount).toBe(1);
    expect(summary.grossAmountTotal).toBe(100);
    expect(summary.mdrFeeTotal).toBe(3);
    expect(summary.cancellations).toEqual({ count: 1, grossAmountTotal: 50 });
    expect(summary.chargebacks).toEqual({ count: 1, grossAmountTotal: 80 });
  });

  it("chargeback_refund conta como chargeback para fins de exclusão dos totais principais", () => {
    const records = [makeRecord({ eventType: "sale" }), makeRecord({ eventType: "chargeback_refund", grossAmount: 30 })];
    const summary = summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(summary.installmentRowsCount).toBe(1);
    expect(summary.chargebacks.count).toBe(1);
    expect(summary.chargebacks.grossAmountTotal).toBe(30);
  });

  it("Pix nunca aparece como paymentMethod real na arquitetura atual — contado explicitamente como 0, nunca omitido", () => {
    const summary = summarizePeriodCost([makeRecord({ paymentMethod: "credito" })], "2026-08-01", "2026-08-31");
    expect(summary.pixSalesCount).toBe(0);
  });

  it("múltiplas parcelas da mesma venda contam como 1 venda mas N parcelas (salesCount vs installmentRowsCount)", () => {
    const records = [
      makeRecord({ acquirerTransactionKey: "venda-1", installmentNumber: 1, grossAmount: 50 }),
      makeRecord({ acquirerTransactionKey: "venda-1", installmentNumber: 2, grossAmount: 50 }),
      makeRecord({ acquirerTransactionKey: "venda-2", installmentNumber: 1, grossAmount: 100 }),
    ];
    const summary = summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(summary.salesCount).toBe(2);
    expect(summary.installmentRowsCount).toBe(3);
  });

  it("lista vazia -> zeros explícitos, nunca NaN/undefined", () => {
    const summary = summarizePeriodCost([], "2026-08-01", "2026-08-31");
    expect(summary.installmentRowsCount).toBe(0);
    expect(summary.grossAmountTotal).toBe(0);
    expect(summary.effectiveMdrRatePercent).toBeNull();
    expect(summary.advanceDataStatus).toBe("indisponivel");
  });

  it("não muta os records de entrada (leitura pura, zero efeito colateral/duplicação)", () => {
    const records = [makeRecord()];
    const snapshot = JSON.parse(JSON.stringify(records));
    summarizePeriodCost(records, "2026-08-01", "2026-08-31");
    expect(records).toEqual(snapshot);
  });
});

describe("buildDailyCostBreakdown", () => {
  it("agrupa por data de captura (capturedAt), ordenado cronologicamente, só eventType=sale", () => {
    const records = [
      makeRecord({ capturedAt: "2026-08-12T09:00:00.000Z", grossAmount: 100, feeAmount: 3 }),
      makeRecord({ capturedAt: "2026-08-10T09:00:00.000Z", grossAmount: 50, feeAmount: 1.5 }),
      makeRecord({ capturedAt: "2026-08-10T18:00:00.000Z", grossAmount: 50, feeAmount: 1.5 }),
      makeRecord({ capturedAt: "2026-08-10T20:00:00.000Z", grossAmount: 999, feeAmount: 99, eventType: "cancellation" }),
    ];
    const daily = buildDailyCostBreakdown(records);
    expect(daily.map((d) => d.date)).toEqual(["2026-08-10", "2026-08-12"]);
    expect(daily[0].grossAmountTotal).toBe(100);
    expect(daily[0].installmentRowsCount).toBe(2);
    expect(daily[1].grossAmountTotal).toBe(100);
  });
});

describe("findWorstCostDay", () => {
  it("retorna o dia com maior custo total confirmado", () => {
    const records = [
      makeRecord({ capturedAt: "2026-08-10T09:00:00.000Z", grossAmount: 100, feeAmount: 3 }),
      makeRecord({ capturedAt: "2026-08-11T09:00:00.000Z", grossAmount: 1000, feeAmount: 40 }),
    ];
    const worst = findWorstCostDay(buildDailyCostBreakdown(records));
    expect(worst?.date).toBe("2026-08-11");
  });

  it("lista vazia -> null, nunca um dia inventado", () => {
    expect(findWorstCostDay([])).toBeNull();
  });
});

describe("buildModalityCostBreakdown", () => {
  it("agrupa por método x bandeira x parcelas, ordenado por bruto desc", () => {
    const records = [
      makeRecord({ paymentMethod: "debito", brandId: "1", installmentNumber: 1, grossAmount: 100, feeAmount: 1.1 }),
      makeRecord({ paymentMethod: "credito", brandId: "1", installmentNumber: 3, grossAmount: 500, feeAmount: 25.5 }),
      makeRecord({ paymentMethod: "credito", brandId: "1", installmentNumber: 3, grossAmount: 300, feeAmount: 15.3 }),
    ];
    const modalities = buildModalityCostBreakdown(records);
    expect(modalities).toHaveLength(2);
    expect(modalities[0].modality).toEqual({ method: "credito", brand: "visa_mastercard", installments: 3 });
    expect(modalities[0].grossAmountTotal).toBe(800);
    expect(modalities[0].installmentRowsCount).toBe(2);
    expect(modalities[1].modality.method).toBe("debito");
  });

  it("exclui cancelamentos/chargebacks da quebra por modalidade", () => {
    const records = [makeRecord({ eventType: "sale", grossAmount: 100 }), makeRecord({ eventType: "chargeback", grossAmount: 500 })];
    const modalities = buildModalityCostBreakdown(records);
    expect(modalities).toHaveLength(1);
    expect(modalities[0].grossAmountTotal).toBe(100);
  });
});

describe("buildTransactionDetailRows", () => {
  it("inclui todos os eventTypes (a UI decide o que filtrar), ordenado por capturedAt", () => {
    const records = [
      makeRecord({ capturedAt: "2026-08-12T09:00:00.000Z", eventType: "sale" }),
      makeRecord({ capturedAt: "2026-08-10T09:00:00.000Z", eventType: "cancellation" }),
    ];
    const rows = buildTransactionDetailRows(records);
    expect(rows.map((r) => r.eventType)).toEqual(["cancellation", "sale"]);
  });

  it("expõe advanceFeeAmount null quando não liquidada, número quando liquidada", () => {
    const rows = buildTransactionDetailRows([makeRecord({ settledAmount: null }), makeRecord({ netAmount: 97, settledAmount: 95.5 })]);
    expect(rows[0].advanceFeeAmount).toBeNull();
    expect(rows[1].advanceFeeAmount).toBeCloseTo(1.5, 2);
  });
});
