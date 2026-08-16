import { describe, expect, it } from "vitest";
import { mapOrdersToRevenueCandidates, type RawJumpParkOrderRow } from "@/lib/finance/jumpparkRevenue";

function makeOrder(overrides: Partial<RawJumpParkOrderRow>): RawJumpParkOrderRow {
  return {
    id: "order-1",
    externalId: "ext-1",
    orderDate: "2026-07-10",
    parkingAmount: "0",
    servicesAmount: "0",
    discountAmount: null,
    clientName: null,
    plateMasked: "ABC1D23",
    ...overrides,
  };
}

/**
 * Missão Financeiro V3.1 — parte pura da derivação de receita JumpPark: exclusão de itens IESA
 * (já reconhecidos via accounts_receivable/iesaClosing.ts) e desconto, sempre travando em zero.
 */
describe("mapOrdersToRevenueCandidates", () => {
  it("mapeia parkingAmount/servicesAmount sem alteração quando não há IESA nem desconto", () => {
    const order = makeOrder({ parkingAmount: "20", servicesAmount: "80" });
    const [candidate] = mapOrdersToRevenueCandidates([order], new Map());
    expect(candidate.parkingAmount).toBe(20);
    expect(candidate.servicesAmount).toBe(80);
  });

  it("abate o valor de itens IESA do valor de serviços — nunca duplica com o fechamento consolidado via AR", () => {
    const order = makeOrder({ id: "order-iesa", servicesAmount: "70" });
    const iesaAmountByOrderId = new Map([["order-iesa", 70]]);
    const [candidate] = mapOrdersToRevenueCandidates([order], iesaAmountByOrderId);
    expect(candidate.servicesAmount).toBe(0);
  });

  it("ordem mista (parte IESA + parte não-IESA no mesmo pedido) só abate a parte IESA, mantendo o resto como receita real", () => {
    const order = makeOrder({ id: "order-mista", servicesAmount: "150" });
    const iesaAmountByOrderId = new Map([["order-mista", 70]]);
    const [candidate] = mapOrdersToRevenueCandidates([order], iesaAmountByOrderId);
    expect(candidate.servicesAmount).toBe(80);
  });

  it("desconto informado é abatido do valor de serviços, nunca do estacionamento", () => {
    const order = makeOrder({ parkingAmount: "20", servicesAmount: "100", discountAmount: "15" });
    const [candidate] = mapOrdersToRevenueCandidates([order], new Map());
    expect(candidate.servicesAmount).toBe(85);
    expect(candidate.parkingAmount).toBe(20);
  });

  it("cortesia (total real da ordem = 0) nunca produz receita negativa nem fabricada — trava em zero", () => {
    const order = makeOrder({ servicesAmount: "50", discountAmount: "50" });
    const [candidate] = mapOrdersToRevenueCandidates([order], new Map());
    expect(candidate.servicesAmount).toBe(0);
  });

  it("desconto maior que o próprio valor de serviços nunca produz receita negativa (trava em zero, não em -R$)", () => {
    const order = makeOrder({ servicesAmount: "30", discountAmount: "999" });
    const [candidate] = mapOrdersToRevenueCandidates([order], new Map());
    expect(candidate.servicesAmount).toBe(0);
  });

  it("preserva externalId, orderDate, clientName e plateMasked para rastreabilidade no drill-down", () => {
    const order = makeOrder({ externalId: "so-999", orderDate: "2026-04-15", clientName: "João Silva", plateMasked: "XYZ9A87" });
    const [candidate] = mapOrdersToRevenueCandidates([order], new Map());
    expect(candidate.externalId).toBe("so-999");
    expect(candidate.orderDate).toBe("2026-04-15");
    expect(candidate.clientName).toBe("João Silva");
    expect(candidate.plateMasked).toBe("XYZ9A87");
  });

  it("nunca produz valores com imprecisão de ponto flutuante", () => {
    const order = makeOrder({ servicesAmount: "33.33", discountAmount: "0.01" });
    const [candidate] = mapOrdersToRevenueCandidates([order], new Map());
    expect(candidate.servicesAmount).toBe(33.32);
  });
});
