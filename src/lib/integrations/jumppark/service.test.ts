import { describe, expect, it } from "vitest";
import { mapOperationOrders, mapServiceOrderForPersistence } from "@/lib/integrations/jumppark/service";
import type { JumpParkServiceOrder } from "@/lib/integrations/jumppark/types";

describe("mapOperationOrders", () => {
  it("só inclui ordens finalizadas (com exitDateTime)", () => {
    const orders: JumpParkServiceOrder[] = [
      { serviceOrderId: "1", entryDateTime: "2026-08-01 08:00:00", exitDateTime: "2026-08-01 09:00:00" },
      { serviceOrderId: "2", entryDateTime: "2026-08-01 10:00:00" }, // ainda no pátio, sem saída
    ];
    const result = mapOperationOrders(orders);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("deriva a data (YYYY-MM-DD) a partir de entryDateTime", () => {
    const orders: JumpParkServiceOrder[] = [{ serviceOrderId: "1", entryDateTime: "2026-08-01 08:00:00", exitDateTime: "2026-08-01 09:00:00" }];
    expect(mapOperationOrders(orders)[0].date).toBe("2026-08-01");
  });

  it("cai para exitDateTime quando entryDateTime está ausente", () => {
    const orders: JumpParkServiceOrder[] = [{ serviceOrderId: "1", exitDateTime: "2026-08-02 18:00:00" }];
    expect(mapOperationOrders(orders)[0].date).toBe("2026-08-02");
  });

  it("nunca inventa placa/telefone completos — sempre mascarados", () => {
    const orders: JumpParkServiceOrder[] = [{ serviceOrderId: "1", exitDateTime: "2026-08-01 09:00:00", plate: "ABC1D23", clientPhone: "48999998888" }];
    const result = mapOperationOrders(orders)[0];
    expect(result.plateMasked).not.toBe("ABC1D23");
    expect(result.clientPhoneMasked).not.toBe("48999998888");
  });
});

describe("mapServiceOrderForPersistence", () => {
  it("mapeia campos enriquecidos reais, sem inventar nenhum", () => {
    const order: JumpParkServiceOrder = {
      serviceOrderId: "abc-123",
      serviceOrderCode: "OS-1",
      entryDateTime: "2026-08-01 08:00:00",
      exitDateTime: "2026-08-01 09:30:00",
      plate: "ABC1D23",
      vehicleModel: "GOL",
      vehicleColor: "PRATA",
      clientName: "Maria Silva",
      clientPhone: "48999998888",
      clientEmail: "maria@example.com",
      amount: "40.00",
      amountServices: "180.00",
      totalAmount: 220,
      paymentMethodName: "Crédito",
      financialSituationName: "Pago",
      operationSituationName: "Fora do pátio",
      situationId: 2,
      financialSituationId: 3,
      discountAmount: "10.00",
      discountType: "percentual",
      typePrice: "TABELA NOVA",
      cardCode: 7,
      userName: "Operador A",
      userOutputName: "Operador B",
      establishmentId: "99",
      establishmentName: "Sta Monica",
      observations: { observation: "cliente pediu pressa" },
      services: [{ description: "Lavação Gold", quantity: 1, amount: "180.00", serviceContractId: "sc-1" }],
    };

    const result = mapServiceOrderForPersistence(order);

    expect(result.externalId).toBe("abc-123");
    expect(result.vehicleColor).toBe("PRATA");
    expect(result.clientEmail).toBe("maria@example.com");
    // Missão CRM V2 Fase 1 — decisão do gestor: a persistência para de mascarar (a auditoria
    // confirmou que a origem já entrega o valor completo; o mascaramento sempre foi só do nosso
    // código). `mapOperationOrders` (exibição, teste acima) continua mascarando normalmente.
    expect(result.plateMasked).toBe("ABC1D23");
    expect(result.clientPhoneMasked).toBe("48999998888");
    expect(result.situationId).toBe(2);
    expect(result.financialSituationId).toBe(3);
    expect(result.discountAmount).toBe(10);
    expect(result.discountType).toBe("percentual");
    expect(result.typePrice).toBe("TABELA NOVA");
    expect(result.cardCode).toBe(7);
    expect(result.staffEntryName).toBe("Operador A");
    expect(result.staffExitName).toBe("Operador B");
    expect(result.establishmentId).toBe("99");
    expect(result.establishmentName).toBe("Sta Monica");
    expect(result.observations).toEqual({ observation: "cliente pediu pressa" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ description: "Lavação Gold", quantity: 1, amount: 180, serviceContractId: "sc-1", commissioners: null });
  });

  it("campo ausente na API vira null, nunca um valor inventado", () => {
    const order: JumpParkServiceOrder = { serviceOrderId: "1", entryDateTime: "2026-08-01 08:00:00", exitDateTime: "2026-08-01 09:00:00" };
    const result = mapServiceOrderForPersistence(order);
    expect(result.vehicleColor).toBeNull();
    expect(result.clientEmail).toBeNull();
    expect(result.situationId).toBeNull();
    expect(result.financialSituationId).toBeNull();
    expect(result.discountAmount).toBeNull();
    expect(result.discountType).toBeNull();
    expect(result.typePrice).toBeNull();
    expect(result.cardCode).toBeNull();
    expect(result.staffEntryName).toBeNull();
    expect(result.staffExitName).toBeNull();
    expect(result.establishmentId).toBeNull();
    expect(result.establishmentName).toBeNull();
    expect(result.observations).toBeNull();
    expect(result.items).toEqual([]);
  });

  it("ordem sem placa vira null, nunca o texto 'Não informado' (isso é só de exibição)", () => {
    const order: JumpParkServiceOrder = { serviceOrderId: "1", entryDateTime: "2026-08-01 08:00:00", exitDateTime: "2026-08-01 09:00:00" };
    const result = mapServiceOrderForPersistence(order);
    expect(result.plateMasked).toBeNull();
  });

  it("item sem descrição cai no rótulo genérico 'Serviço', mas quantidade ausente permanece null (não vira 0)", () => {
    const order: JumpParkServiceOrder = {
      serviceOrderId: "1",
      entryDateTime: "2026-08-01 08:00:00",
      exitDateTime: "2026-08-01 09:00:00",
      services: [{ amount: "50.00" }],
    };
    const result = mapServiceOrderForPersistence(order);
    expect(result.items[0].description).toBe("Serviço");
    expect(result.items[0].quantity).toBeNull();
    expect(result.items[0].amount).toBe(50);
  });
});
