import { describe, expect, it } from "vitest";
import { aggregateJumpParkCustomersAndVehicles, type OrderForAggregation } from "@/lib/integrations/jumppark/customers";

function order(overrides: Partial<OrderForAggregation>): OrderForAggregation {
  return {
    id: "order-1",
    clientName: "Maria Silva",
    clientPhoneMasked: "*******99",
    plateMasked: "AB***12",
    vehicleModel: "GOL",
    orderDate: "2026-08-01",
    totalAmount: 100,
    servicesAmount: 0,
    ...overrides,
  };
}

describe("aggregateJumpParkCustomersAndVehicles", () => {
  it("agrupa ordens do mesmo cliente (mesmo nome normalizado) num único registro", () => {
    const orders = [
      order({ id: "1", orderDate: "2026-08-01", totalAmount: 100 }),
      order({ id: "2", orderDate: "2026-08-03", totalAmount: 200 }),
    ];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.customers).toHaveLength(1);
    const c = result.customers[0];
    expect(c.visitCount).toBe(2);
    expect(c.totalSpent).toBe(300);
    expect(c.averageTicket).toBe(150);
    expect(c.firstVisitAt).toBe("2026-08-01");
    expect(c.lastVisitAt).toBe("2026-08-03");
  });

  it("nomes diferentes viram clientes diferentes", () => {
    const orders = [order({ id: "1", clientName: "Maria Silva" }), order({ id: "2", clientName: "João Souza" })];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.customers).toHaveLength(2);
  });

  it("ordem sem nome e sem telefone não gera cliente (sem identidade, nunca inventa)", () => {
    const orders = [order({ id: "1", clientName: null, clientPhoneMasked: null })];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.customers).toHaveLength(0);
    expect(result.orderCustomerExternalId.get("1")).toBeNull();
  });

  it("telefone mascarado nunca vira chave de identidade (menos de 8 dígitos reais)", () => {
    const orders = [order({ id: "1", clientPhoneMasked: "*******99", clientName: "Maria Silva" })];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.customers[0].externalId).toBe("name:maria silva");
  });

  it("servicesOrderCount conta só ordens com valor de serviço > 0", () => {
    const orders = [order({ id: "1", servicesAmount: 0 }), order({ id: "2", servicesAmount: 50 }), order({ id: "3", servicesAmount: 0 })];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.customers[0].servicesOrderCount).toBe(1);
  });

  it("agrupa veículos por placa mascarada, nunca por modelo", () => {
    const orders = [
      order({ id: "1", plateMasked: "AB***12", vehicleModel: "GOL", orderDate: "2026-08-01" }),
      order({ id: "2", plateMasked: "AB***12", vehicleModel: "GOL", orderDate: "2026-08-05" }),
    ];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0].visitCount).toBe(2);
    expect(result.vehicles[0].firstSeenAt).toBe("2026-08-01");
    expect(result.vehicles[0].lastSeenAt).toBe("2026-08-05");
  });

  it("ordem sem placa não gera veículo", () => {
    const orders = [order({ id: "1", plateMasked: null })];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.vehicles).toHaveLength(0);
    expect(result.orderVehicleExternalId.get("1")).toBeNull();
  });

  it("placa 'Não informado' (texto de exibição de maskPlate para ausência) nunca vira identidade de veículo fictício", () => {
    const orders = [
      order({ id: "1", plateMasked: "Não informado", clientName: "Maria Silva" }),
      order({ id: "2", plateMasked: "Não informado", clientName: "João Souza" }),
    ];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.vehicles).toHaveLength(0);
    expect(result.orderVehicleExternalId.get("1")).toBeNull();
    expect(result.orderVehicleExternalId.get("2")).toBeNull();
  });

  it("resolve o dono do veículo pela ordem mais recente daquele veículo", () => {
    const orders = [
      order({ id: "1", plateMasked: "AB***12", clientName: "Maria Silva", orderDate: "2026-08-01" }),
      order({ id: "2", plateMasked: "AB***12", clientName: "Carlos Souza", orderDate: "2026-08-10" }),
    ];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.vehicles[0].customerExternalId).toBe("name:carlos souza");
  });

  it("mapeia cada ordem de volta para o externalId do cliente e do veículo resolvidos", () => {
    const orders = [order({ id: "1", clientName: "Maria Silva", plateMasked: "AB***12" })];
    const result = aggregateJumpParkCustomersAndVehicles(orders);
    expect(result.orderCustomerExternalId.get("1")).toBe("name:maria silva");
    expect(result.orderVehicleExternalId.get("1")).toBe("plate:AB***12");
  });
});
