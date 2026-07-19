import { describe, expect, it } from "vitest";
import { computePeakHour, topServicesByRevenue } from "@/lib/zezinho/comparison-engine";
import type { OperationalOrder } from "@/lib/integrations/jumppark/operations-summary";

function makeOrder(overrides: Partial<OperationalOrder> = {}): OperationalOrder {
  return {
    externalId: "1",
    code: null,
    date: "2026-07-19",
    entryDateTime: null,
    exitDateTime: null,
    entryTime: null,
    exitTime: "10:00",
    clientName: null,
    clientPhoneMasked: null,
    vehicleModel: "COROLLA",
    plateMasked: "AB***01",
    services: [],
    kind: "lavacao",
    parkingAmount: 0,
    servicesAmount: 100,
    totalAmount: 100,
    paymentMethodName: "Pix",
    paymentMethodCategory: "pix",
    situation: "Pago",
    ...overrides,
  };
}

describe("computePeakHour", () => {
  it("retorna a hora com mais saídas registradas", () => {
    const orders = [makeOrder({ exitTime: "10:15" }), makeOrder({ exitTime: "10:45" }), makeOrder({ exitTime: "14:00" })];
    expect(computePeakHour(orders)).toEqual({ hour: "10h", count: 2 });
  });

  it("retorna null quando não há nenhuma saída registrada", () => {
    expect(computePeakHour([makeOrder({ exitTime: null })])).toBeNull();
  });

  it("retorna null para lista vazia", () => {
    expect(computePeakHour([])).toBeNull();
  });
});

describe("topServicesByRevenue", () => {
  it("agrupa por descrição de serviço e ordena por faturamento", () => {
    const orders = [
      makeOrder({ services: [{ description: "Lavação Bronze", amount: 80 }] }),
      makeOrder({ services: [{ description: "Lavação Bronze", amount: 80 }] }),
      makeOrder({ services: [{ description: "Vitrificação", amount: 500 }] }),
    ];
    const top = topServicesByRevenue(orders);
    expect(top[0]).toEqual({ description: "Vitrificação", amount: 500 });
    expect(top[1]).toEqual({ description: "Lavação Bronze", amount: 160 });
  });

  it("retorna lista vazia sem nenhum serviço", () => {
    expect(topServicesByRevenue([makeOrder({ services: [] })])).toEqual([]);
  });

  it("respeita o limite informado", () => {
    const orders = Array.from({ length: 10 }, (_, i) => makeOrder({ services: [{ description: `Serviço ${i}`, amount: i + 1 }] }));
    expect(topServicesByRevenue(orders, 3)).toHaveLength(3);
  });
});
