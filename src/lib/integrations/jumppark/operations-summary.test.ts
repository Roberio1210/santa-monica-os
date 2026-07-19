import { describe, expect, it } from "vitest";
import { comparePeriods, computeOperationalSummary, type OperationalOrder } from "@/lib/integrations/jumppark/operations-summary";

function makeOrder(overrides: Partial<OperationalOrder> = {}): OperationalOrder {
  return {
    externalId: "ORD-1",
    code: "C1",
    date: "2026-07-18",
    entryDateTime: "2026-07-18 10:00:00",
    exitDateTime: "2026-07-18 10:30:00",
    entryTime: "10:00",
    exitTime: "10:30",
    clientName: null,
    clientPhoneMasked: null,
    vehicleModel: "COROLLA",
    plateMasked: "AB***01",
    services: [],
    kind: "estacionamento",
    parkingAmount: 40,
    servicesAmount: 0,
    totalAmount: 40,
    paymentMethodName: "Débito",
    paymentMethodCategory: "debito",
    situation: "Pago",
    ...overrides,
  };
}

describe("computeOperationalSummary", () => {
  it("retorna tudo zerado/nulo para lista vazia, nunca inventa valor", () => {
    const summary = computeOperationalSummary([]);
    expect(summary).toMatchObject({ ordersCount: 0, vehiclesServed: 0, revenue: 0, averageTicket: null, paymentBreakdown: [] });
  });

  it("separa receita de lavação e estacionamento corretamente", () => {
    const orders = [
      makeOrder({ externalId: "1", kind: "estacionamento", totalAmount: 40, plateMasked: "AB***01" }),
      makeOrder({ externalId: "2", kind: "lavacao", totalAmount: 180, servicesAmount: 180, parkingAmount: 0, plateMasked: "CD***02" }),
    ];
    const summary = computeOperationalSummary(orders);
    expect(summary.parkingRevenue).toBe(40);
    expect(summary.washRevenue).toBe(180);
    expect(summary.revenue).toBe(220);
    expect(summary.washCount).toBe(1);
    expect(summary.parkingCount).toBe(1);
  });

  it("conta veículos atendidos por placa única, não por ordem", () => {
    const orders = [
      makeOrder({ externalId: "1", plateMasked: "AB***01" }),
      makeOrder({ externalId: "2", plateMasked: "AB***01" }),
      makeOrder({ externalId: "3", plateMasked: "CD***02" }),
    ];
    expect(computeOperationalSummary(orders).vehiclesServed).toBe(2);
  });

  it("ticket médio é a receita total dividida pelo número de ordens", () => {
    const orders = [makeOrder({ externalId: "1", totalAmount: 100 }), makeOrder({ externalId: "2", totalAmount: 300 })];
    expect(computeOperationalSummary(orders).averageTicket).toBe(200);
  });

  it("agrupa formas de pagamento com total e contagem", () => {
    const orders = [
      makeOrder({ externalId: "1", paymentMethodCategory: "pix", totalAmount: 50 }),
      makeOrder({ externalId: "2", paymentMethodCategory: "pix", totalAmount: 30 }),
      makeOrder({ externalId: "3", paymentMethodCategory: "dinheiro", totalAmount: 20 }),
    ];
    const summary = computeOperationalSummary(orders);
    const pix = summary.paymentBreakdown.find((p) => p.method === "pix");
    expect(pix).toEqual({ method: "pix", label: "Pix", amount: 80, count: 2 });
  });

  it("clientes identificados só conta ordens com nome de cliente real, nunca infere", () => {
    const orders = [makeOrder({ externalId: "1", clientName: "Fulano" }), makeOrder({ externalId: "2", clientName: null }), makeOrder({ externalId: "3", clientName: "Fulano" })];
    expect(computeOperationalSummary(orders).clientsIdentified).toBe(1);
  });
});

describe("comparePeriods", () => {
  it("aumento quando o valor atual é maior", () => {
    const c = comparePeriods(150, 100);
    expect(c.trend).toBe("aumento");
    expect(c.deltaPercent).toBe(50);
  });

  it("queda quando o valor atual é menor", () => {
    const c = comparePeriods(80, 100);
    expect(c.trend).toBe("queda");
    expect(c.deltaPercent).toBe(-20);
  });

  it("estável para variação pequena (dentro de 0.5%)", () => {
    const c = comparePeriods(100.3, 100);
    expect(c.trend).toBe("estavel");
  });

  it("indisponível quando não há dado do período anterior — nunca inventa percentual", () => {
    const c = comparePeriods(100, null);
    expect(c).toEqual({ current: 100, previous: null, deltaPercent: null, trend: "indisponivel" });
  });

  it("base zero com valor atual zero é estável", () => {
    expect(comparePeriods(0, 0).trend).toBe("estavel");
  });

  it("base zero com valor atual positivo é aumento sem percentual (divisão por zero não faz sentido)", () => {
    const c = comparePeriods(50, 0);
    expect(c.trend).toBe("aumento");
    expect(c.deltaPercent).toBeNull();
  });
});
