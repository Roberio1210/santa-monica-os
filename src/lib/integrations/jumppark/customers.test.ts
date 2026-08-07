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

  describe("identityConfidence (Missão 28)", () => {
    it("nome de um único token, uma só placa => provisório (não é prova definitiva, mas não há ambiguidade)", () => {
      const orders = [order({ id: "1", clientName: "Lucas", plateMasked: "AB***12" }), order({ id: "2", clientName: "Lucas", plateMasked: "AB***12" })];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.customers[0].identityConfidence).toBe("provisorio");
    });

    it("nome com 2+ termos => provável, mesmo com nome comum", () => {
      const orders = [order({ id: "1", clientName: "Lucas Andrade", plateMasked: "AB***12" })];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.customers[0].identityConfidence).toBe("provavel");
    });

    it("nome de um único token associado a 2+ placas distintas => ambíguo (risco real de homônimo fundido)", () => {
      const orders = [
        order({ id: "1", clientName: "Lucas", plateMasked: "AB***12", orderDate: "2026-08-01" }),
        order({ id: "2", clientName: "Lucas", plateMasked: "CD***34", orderDate: "2026-08-05" }),
      ];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.customers).toHaveLength(1); // não separa sozinho — só classifica como ambíguo
      expect(result.customers[0].identityConfidence).toBe("ambiguo");
      expect(result.customers[0].identityConfidenceReason).toContain("2 placas distintas");
    });

    it("confirmado nunca é atingido hoje (sem telefone completo nem id estruturado da JumpPark)", () => {
      const orders = [order({ id: "1", clientName: "Lucas Andrade Souza", plateMasked: "AB***12" })];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.customers[0].identityConfidence).not.toBe("confirmado");
    });
  });

  describe("enriquecimento retroativo (Missão 28)", () => {
    it("ordem antiga sem nome ganha o cliente da mesma placa quando só existe UM candidato nomeado", () => {
      const orders = [
        order({ id: "old", clientName: null, plateMasked: "AB***12", orderDate: "2026-03-10", totalAmount: 50 }),
        order({ id: "new", clientName: "Fernanda Lima", plateMasked: "AB***12", orderDate: "2026-07-20", totalAmount: 80 }),
      ];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.orderCustomerExternalId.get("old")).toBe("name:fernanda lima");
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].visitCount).toBe(2);
      expect(result.customers[0].totalSpent).toBe(130);
      expect(result.reviewItems).toHaveLength(0); // sem ambiguidade, nada vai para a fila
    });

    it("ordem sem nome e sem placa útil continua não resolvida (não há evidência para enriquecer)", () => {
      const orders = [order({ id: "1", clientName: null, plateMasked: null })];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.orderCustomerExternalId.get("1")).toBeNull();
      expect(result.customers).toHaveLength(0);
      expect(result.reviewItems).toHaveLength(0);
    });

    it("ordem sem nome cuja placa nunca aparece em ordem nomeada continua não resolvida (sem candidato)", () => {
      const orders = [order({ id: "1", clientName: null, plateMasked: "AB***12" })];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.orderCustomerExternalId.get("1")).toBeNull();
      expect(result.customers).toHaveLength(0);
    });

    it("placa com 2 nomes distintos NUNCA funde automaticamente — ordem sem nome fica não resolvida e vira item de revisão", () => {
      const orders = [
        order({ id: "unnamed", clientName: null, plateMasked: "AB***12", orderDate: "2026-05-01" }),
        order({ id: "n1", clientName: "Emilly", plateMasked: "AB***12", orderDate: "2026-06-01" }),
        order({ id: "n2", clientName: "Renata", plateMasked: "AB***12", orderDate: "2026-07-01" }),
      ];
      const result = aggregateJumpParkCustomersAndVehicles(orders);

      // As duas ordens nomeadas continuam como clientes distintos — nunca fundidas por homônimo de placa.
      expect(result.customers).toHaveLength(2);
      expect(result.orderCustomerExternalId.get("n1")).toBe("name:emilly");
      expect(result.orderCustomerExternalId.get("n2")).toBe("name:renata");
      // A ordem sem nome NÃO é atribuída a nenhum dos dois — fica não resolvida.
      expect(result.orderCustomerExternalId.get("unnamed")).toBeNull();

      expect(result.reviewItems).toHaveLength(1);
      const item = result.reviewItems[0];
      expect(item.subjectKey).toBe("plate:AB***12");
      expect(item.candidates.map((c) => c.name).sort()).toEqual(["Emilly", "Renata"]);
      expect(item.unresolvedOrders.map((o) => o.orderId)).toEqual(["unnamed"]);
    });

    it("placa com 2 nomes distintos, ambos SEM outras ordens sem-nome, ainda vira item de revisão com unresolvedOrders vazio", () => {
      const orders = [
        order({ id: "n1", clientName: "Andre", plateMasked: "RL***83", orderDate: "2026-06-01" }),
        order({ id: "n2", clientName: "Eduardo", plateMasked: "RL***83", orderDate: "2026-06-10" }),
      ];
      const result = aggregateJumpParkCustomersAndVehicles(orders);
      expect(result.reviewItems).toHaveLength(1);
      expect(result.reviewItems[0].unresolvedOrders).toHaveLength(0);
      expect(result.customers).toHaveLength(2); // preserva os registros existentes, não força fusão nem separação
    });
  });

  describe("manualCustomerLinks (decisão humana na fila de revisão, Missão 28)", () => {
    it("ordem com vínculo manual entra na contagem do cliente escolhido, mesmo sendo ambígua para a regra automática", () => {
      const orders = [
        order({ id: "unnamed", clientName: null, plateMasked: "AB***12", orderDate: "2026-05-01", totalAmount: 40 }),
        order({ id: "n1", clientName: "Emilly", plateMasked: "AB***12", orderDate: "2026-06-01", totalAmount: 60 }),
        order({ id: "n2", clientName: "Renata", plateMasked: "AB***12", orderDate: "2026-07-01", totalAmount: 70 }),
      ];
      const manualLinks = new Map([["unnamed", "name:emilly"]]);
      const result = aggregateJumpParkCustomersAndVehicles(orders, manualLinks);

      expect(result.orderCustomerExternalId.get("unnamed")).toBe("name:emilly");
      const emilly = result.customers.find((c) => c.externalId === "name:emilly")!;
      expect(emilly.visitCount).toBe(2);
      expect(emilly.totalSpent).toBe(100);

      // O item de revisão continua existindo (a ambiguidade de nomes na placa não desaparece),
      // mas a ordem decidida sai de `unresolvedOrders` — já não está mais pendente.
      expect(result.reviewItems).toHaveLength(1);
      expect(result.reviewItems[0].unresolvedOrders).toHaveLength(0);
    });

    it("vínculo manual nunca é sobrescrito pela regra automática de enriquecimento (mesmo se só sobrasse 1 candidato)", () => {
      const orders = [
        order({ id: "unnamed", clientName: null, plateMasked: "AB***12", orderDate: "2026-05-01" }),
        order({ id: "n1", clientName: "Fernanda", plateMasked: "AB***12", orderDate: "2026-07-01" }),
      ];
      const manualLinks = new Map([["unnamed", "name:some-other-customer"]]);
      const result = aggregateJumpParkCustomersAndVehicles(orders, manualLinks);
      // Mesmo havendo um único candidato nomeado ("Fernanda") que a regra automática escolheria,
      // a decisão manual (para outro cliente qualquer) prevalece.
      expect(result.orderCustomerExternalId.get("unnamed")).toBe("name:some-other-customer");
    });
  });
});
