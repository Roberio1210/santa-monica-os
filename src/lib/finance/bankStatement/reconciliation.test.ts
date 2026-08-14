import { describe, expect, it } from "vitest";
import { matchStatementLineAgainstStoneSettlements } from "@/lib/finance/bankStatement/reconciliation";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

function tx(overrides: Partial<StoneNormalizedTransactionRecord>): StoneNormalizedTransactionRecord {
  return {
    externalKey: "key-1",
    acquirerTransactionKey: "acq-1",
    authorizationCode: "auth-1",
    initiatorTransactionKey: null,
    establishmentCode: "estab-1",
    terminalSerialNumber: null,
    capturedAt: "2026-08-01T10:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 100,
    feeAmount: 3.27,
    netAmount: 96.73,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "settled_on_time",
    expectedPaymentDate: "2026-08-02",
    settledPaymentDate: "2026-08-02",
    settledAmount: 96.73,
    sourceFile: "file.xml",
    importRunId: null,
    ...overrides,
  };
}

describe("matchStatementLineAgainstStoneSettlements — nunca gera receita nova, só confirma liquidação", () => {
  it("sem nenhuma transação Stone liquidada na data -> nao_conciliado (silêncio não é confirmação)", () => {
    const result = matchStatementLineAgainstStoneSettlements(100, "2026-08-02", []);
    expect(result.status).toBe("nao_conciliado");
    expect(result.matchedStoneAmount).toBeNull();
  });

  it("soma das parcelas liquidadas bate exatamente com o valor do extrato -> conciliado", () => {
    const result = matchStatementLineAgainstStoneSettlements(96.73, "2026-08-02", [tx({})]);
    expect(result.status).toBe("conciliado");
    expect(result.matchedStoneAmount).toBe(96.73);
    expect(result.matchedStoneDivergence).toBe(0);
  });

  it("soma de várias parcelas do mesmo dia bate com o extrato -> conciliado", () => {
    const result = matchStatementLineAgainstStoneSettlements(
      193.46,
      "2026-08-02",
      [tx({ externalKey: "a" }), tx({ externalKey: "b" })],
    );
    expect(result.status).toBe("conciliado");
  });

  it("diferença de 1 centavo por arredondamento ainda é conciliado (tolerância)", () => {
    const result = matchStatementLineAgainstStoneSettlements(96.74, "2026-08-02", [tx({})]);
    expect(result.status).toBe("conciliado");
  });

  it("diferença real entre extrato e Stone -> sugerido, nunca conciliado silenciosamente", () => {
    const result = matchStatementLineAgainstStoneSettlements(150, "2026-08-02", [tx({})]);
    expect(result.status).toBe("sugerido");
    expect(result.matchedStoneDivergence).toBeCloseTo(53.27, 2);
  });

  it("usa settledAmount quando disponível, nunca netAmount quando os dois divergem", () => {
    const result = matchStatementLineAgainstStoneSettlements(90, "2026-08-02", [tx({ netAmount: 96.73, settledAmount: 90 })]);
    expect(result.status).toBe("conciliado");
  });
});
