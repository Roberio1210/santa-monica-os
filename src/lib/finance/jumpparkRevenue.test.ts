import { describe, expect, it } from "vitest";
import { mapOrdersToRevenueCandidates, type RawJumpParkOrderItemRow, type RawJumpParkOrderRow } from "@/lib/finance/jumpparkRevenue";

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
    partnerId: null,
    ...overrides,
  };
}

function itemsMap(entries: [string, RawJumpParkOrderItemRow[]][]): Map<string, RawJumpParkOrderItemRow[]> {
  return new Map(entries);
}

/**
 * Missão Financeiro V3.1, ampliada na V4.2 e na V7/Fase C3 — parte pura da derivação de receita
 * JumpPark: exclui a receita já reconhecida via o fechamento consolidado de parceiro corporativo
 * (accounts_receivable) e desconto, sempre travando em zero. Duas fontes de exclusão, ambas sempre
 * pela ORDEM INTEIRA (nunca só o item que bateu): vínculo formal (`partnerId`) e fallback textual
 * legado ("iesa" no client_name OU em qualquer item, só para ordens sem vínculo ainda).
 */
describe("mapOrdersToRevenueCandidates", () => {
  it("mapeia parkingAmount/servicesAmount sem alteração quando não há parceiro nem desconto", () => {
    const order = makeOrder({ parkingAmount: "20", servicesAmount: "80" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.parkingAmount).toBe(20);
    expect(candidate.servicesAmount).toBe(80);
  });

  it("ordem vinculada formalmente a um parceiro corporativo (partnerId) exclui o valor INTEIRO da ordem, mesmo sem nenhum item 'iesa'", () => {
    const order = makeOrder({ id: "order-linked", servicesAmount: "170", partnerId: "partner-iesa" });
    const items = itemsMap([]); // vínculo por partnerId nunca depende de texto de item
    const [candidate] = mapOrdersToRevenueCandidates([order], items);
    expect(candidate.servicesAmount).toBe(0);
  });

  it("ordem vinculada com desconto abate o desconto do valor excluído (nunca produz exclusão maior que o real)", () => {
    const order = makeOrder({ id: "order-linked-discount", servicesAmount: "170", discountAmount: "20", partnerId: "partner-iesa" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.servicesAmount).toBe(0); // toda a ordem some da receita genérica, líquida de desconto
  });

  it("fallback textual legado: ordem SEM vínculo formal, item cuja descrição contém 'iesa' abate só aquele valor", () => {
    const order = makeOrder({ id: "order-legacy-iesa", servicesAmount: "70" });
    const items = itemsMap([["order-legacy-iesa", [{ serviceOrderId: "order-legacy-iesa", description: "Lavação Parceria IESA - Nissan", amount: "70" }]]]);
    const [candidate] = mapOrdersToRevenueCandidates([order], items);
    expect(candidate.servicesAmount).toBe(0);
  });

  it("fallback textual legado: ordem mista (parte iesa + parte não-iesa) exclui a ordem INTEIRA, não só o item que bateu — Missão V7/Fase C3, mesma regra já aplicada a partnerId (achado real de agosto/2026: item 'Polimento Peça - Nissan' na mesma ordem de uma 'Lavação Parceria IESA' ficava de fora)", () => {
    const order = makeOrder({ id: "order-mista", servicesAmount: "150" });
    const items = itemsMap([["order-mista", [{ serviceOrderId: "order-mista", description: "Lavação Parceria IESA - Nissan", amount: "70" }]]]);
    const [candidate] = mapOrdersToRevenueCandidates([order], items);
    expect(candidate.servicesAmount).toBe(0);
  });

  it("fallback textual legado reconhece a ordem pelo clientName mesmo quando NENHUM item contém 'iesa' — Missão V7/Fase C3 (achado real de agosto/2026: client_name 'grupo Iesa', único item 'Polimento Peça - Nissan')", () => {
    const order = makeOrder({ id: "order-cliente-iesa", servicesAmount: "100", clientName: "grupo Iesa" });
    const items = itemsMap([["order-cliente-iesa", [{ serviceOrderId: "order-cliente-iesa", description: "Polimento Peça - Nissan", amount: "100" }]]]);
    const [candidate] = mapOrdersToRevenueCandidates([order], items);
    expect(candidate.servicesAmount).toBe(0);
  });

  it("fallback textual legado NUNCA enxerga 'Polimento Peça - Nissan' sozinho quando nem o item nem o clientName contêm 'iesa' — é exatamente o gap que o vínculo formal (partnerId) corrige", () => {
    const order = makeOrder({ id: "order-polimento-nissan", servicesAmount: "100" });
    const items = itemsMap([["order-polimento-nissan", [{ serviceOrderId: "order-polimento-nissan", description: "Polimento Peça - Nissan", amount: "100" }]]]);
    const [candidate] = mapOrdersToRevenueCandidates([order], items);
    expect(candidate.servicesAmount).toBe(100); // continua contando como receita genérica sem o vínculo formal
  });

  it("desconto informado é abatido do valor de serviços, nunca do estacionamento", () => {
    const order = makeOrder({ parkingAmount: "20", servicesAmount: "100", discountAmount: "15" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.servicesAmount).toBe(85);
    expect(candidate.parkingAmount).toBe(20);
  });

  it("cortesia (total real da ordem = 0) nunca produz receita negativa nem fabricada — trava em zero", () => {
    const order = makeOrder({ servicesAmount: "50", discountAmount: "50" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.servicesAmount).toBe(0);
  });

  it("desconto maior que o próprio valor de serviços nunca produz receita negativa (trava em zero, não em -R$)", () => {
    const order = makeOrder({ servicesAmount: "30", discountAmount: "999" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.servicesAmount).toBe(0);
  });

  it("preserva externalId, orderDate, clientName e plateMasked para rastreabilidade no drill-down", () => {
    const order = makeOrder({ externalId: "so-999", orderDate: "2026-04-15", clientName: "João Silva", plateMasked: "XYZ9A87" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.externalId).toBe("so-999");
    expect(candidate.orderDate).toBe("2026-04-15");
    expect(candidate.clientName).toBe("João Silva");
    expect(candidate.plateMasked).toBe("XYZ9A87");
  });

  it("nunca produz valores com imprecisão de ponto flutuante", () => {
    const order = makeOrder({ servicesAmount: "33.33", discountAmount: "0.01" });
    const [candidate] = mapOrdersToRevenueCandidates([order], itemsMap([]));
    expect(candidate.servicesAmount).toBe(33.32);
  });
});
