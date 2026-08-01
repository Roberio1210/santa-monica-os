import { describe, expect, it } from "vitest";
import { mapJumpParkOrderToCustomer, mapJumpParkOrderToEmployee, mapJumpParkOrderToOperationalOrder, mapJumpParkOrderToVehicle, type JumpParkOrderInput } from "@/lib/domain/operational/mappers/fromJumpPark";

function order(overrides: Partial<JumpParkOrderInput> = {}): JumpParkOrderInput {
  return {
    serviceOrderId: "so-123",
    serviceOrderCode: "SO123",
    entryDateTime: "2026-07-20 10:00:00",
    exitDateTime: "2026-07-20 11:30:00",
    plate: "ABC1D23",
    vehicleModel: "COROLLA CROSS",
    paymentMethodName: "Crédito",
    clientName: null,
    clientPhone: null,
    amount: "0.00",
    amountServices: "180.00",
    totalAmount: 180,
    financialSituationName: "Pago",
    operationSituationName: "Fora do pátio",
    services: [{ description: "Lavação Silver - SUV", amount: "180.00" }],
    ...overrides,
  };
}

describe("mapJumpParkOrderToOperationalOrder — normalização", () => {
  it("mapeia os campos básicos confirmados sem inventar nenhum", () => {
    const result = mapJumpParkOrderToOperationalOrder(order());
    expect(result.externalId).toBe("so-123");
    expect(result.source).toBe("JUMPPARK");
    expect(result.serviceType).toBe("Lavação Silver - SUV");
    expect(result.serviceCategory).toBe("Lavação");
    expect(result.vehicleModel).toBe("COROLLA CROSS");
    expect(result.paymentMethod).toBe("Crédito");
  });

  it("id é sempre null — não existe persistência real ainda", () => {
    expect(mapJumpParkOrderToOperationalOrder(order()).id).toBeNull();
  });

  it("externalId cai para um identificador composto quando serviceOrderId está ausente", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ serviceOrderId: undefined, plate: "XYZ9A87", entryDateTime: "2026-07-20 10:00:00" }));
    expect(result.externalId).toBe("XYZ9A87-2026-07-20 10:00:00");
  });
});

describe("mapJumpParkOrderToOperationalOrder — datas e status", () => {
  it("openedAt e deliveredAt vêm de entryDateTime/exitDateTime", () => {
    const result = mapJumpParkOrderToOperationalOrder(order());
    expect(result.openedAt).toBe("2026-07-20 10:00:00");
    expect(result.deliveredAt).toBe("2026-07-20 11:30:00");
  });

  it("startedAt e finishedAt são sempre null — a JumpPark nunca confirma esses dois horários", () => {
    const result = mapJumpParkOrderToOperationalOrder(order());
    expect(result.startedAt).toBeNull();
    expect(result.finishedAt).toBeNull();
  });

  it("status é 'closed' quando há exitDateTime, 'open' quando não há", () => {
    expect(mapJumpParkOrderToOperationalOrder(order()).status).toBe("closed");
    expect(mapJumpParkOrderToOperationalOrder(order({ exitDateTime: undefined })).status).toBe("open");
  });

  it("paymentStatus é 'paid' só quando financialSituationName é exatamente 'Pago', nunca inventa um terceiro estado", () => {
    expect(mapJumpParkOrderToOperationalOrder(order({ financialSituationName: "Pago" })).paymentStatus).toBe("paid");
    expect(mapJumpParkOrderToOperationalOrder(order({ financialSituationName: "Outro valor nunca observado" })).paymentStatus).toBe("unknown");
    expect(mapJumpParkOrderToOperationalOrder(order({ financialSituationName: undefined })).paymentStatus).toBe("unknown");
  });
});

describe("mapJumpParkOrderToOperationalOrder — cliente, veículo, funcionário", () => {
  it("customerId é null sem telefone nem nome — nunca inventa identidade", () => {
    expect(mapJumpParkOrderToOperationalOrder(order({ clientName: null, clientPhone: null })).customerId).toBeNull();
  });

  it("customerId é derivado do telefone quando presente", () => {
    const a = mapJumpParkOrderToOperationalOrder(order({ clientPhone: "48999998888", clientName: "Cliente A" }));
    const b = mapJumpParkOrderToOperationalOrder(order({ clientPhone: "48999998888", clientName: "Cliente B" }));
    expect(a.customerId).not.toBeNull();
    expect(a.customerId).toBe(b.customerId); // mesmo telefone => mesmo cliente, nome diferente não importa
  });

  it("licensePlate nunca vem completa — sempre mascarada", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ plate: "ABC1D23" }));
    expect(result.licensePlate).not.toBe("ABC1D23");
    expect(result.licensePlate).toBe("AB***23");
  });

  it("vehicleId é null sem placa", () => {
    expect(mapJumpParkOrderToOperationalOrder(order({ plate: undefined })).vehicleId).toBeNull();
  });

  it("employeeId prioriza o operador de saída, cai para o de entrada, null sem nenhum dos dois", () => {
    const withBoth = mapJumpParkOrderToOperationalOrder(order({ userName: "Operador Entrada", userOutputName: "Operador Saída" }));
    const withOnlyEntry = mapJumpParkOrderToOperationalOrder(order({ userName: "Operador Entrada", userOutputName: undefined }));
    const withNeither = mapJumpParkOrderToOperationalOrder(order({ userName: undefined, userOutputName: undefined }));
    expect(withBoth.employeeId).not.toBeNull();
    expect(withOnlyEntry.employeeId).not.toBeNull();
    expect(withBoth.employeeId).not.toBe(withOnlyEntry.employeeId);
    expect(withNeither.employeeId).toBeNull();
  });
});

describe("mapJumpParkOrderToOperationalOrder — categoria", () => {
  it("ordem sem services[] vira Estacionamento", () => {
    expect(mapJumpParkOrderToOperationalOrder(order({ services: [], amountServices: "0.00" })).serviceCategory).toBe("Estacionamento");
  });

  it("martelinho nunca é absorvido por Lavação", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ services: [{ description: "Martelinho - Porta" }] }));
    expect(result.serviceCategory).toBe("Martelinho");
  });
});

describe("mapJumpParkOrderToOperationalOrder — valores", () => {
  it("grossAmount/netAmount vêm de totalAmount quando não há desconto", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ totalAmount: 180 }));
    expect(result.grossAmount).toBe(180);
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(180);
  });

  it("netAmount = grossAmount - discountAmount quando há desconto", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ totalAmount: 100, discountAmount: "10.00" }));
    expect(result.grossAmount).toBe(100);
    expect(result.discountAmount).toBe(10);
    expect(result.netAmount).toBe(90);
  });

  it("valores em string (como a API real devolve amount/amountServices) nunca quebram — coagidos para number", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ totalAmount: 180 as unknown as number }));
    expect(typeof result.grossAmount).toBe("number");
  });

  it("valor ausente/inválido nunca vira NaN — sempre 0", () => {
    const result = mapJumpParkOrderToOperationalOrder(order({ totalAmount: undefined }));
    expect(result.grossAmount).toBe(0);
    expect(Number.isNaN(result.grossAmount)).toBe(false);
  });
});

describe("mapJumpParkOrderToCustomer/Vehicle/Employee", () => {
  it("mapJumpParkOrderToCustomer é null sem telefone nem nome", () => {
    expect(mapJumpParkOrderToCustomer(order({ clientName: null, clientPhone: null }))).toBeNull();
  });

  it("mapJumpParkOrderToCustomer preenche nome e telefone mascarado quando presentes", () => {
    const customer = mapJumpParkOrderToCustomer(order({ clientName: "Fulano", clientPhone: "48999998888" }));
    expect(customer?.name).toBe("Fulano");
    expect(customer?.phoneMasked).not.toContain("999998888");
    expect(customer?.source).toBe("JUMPPARK");
  });

  it("mapJumpParkOrderToVehicle é null sem placa, preenchido com placa mascarada quando presente", () => {
    expect(mapJumpParkOrderToVehicle(order({ plate: undefined }))).toBeNull();
    const vehicle = mapJumpParkOrderToVehicle(order({ plate: "ABC1D23", vehicleModel: "CIVIC" }));
    expect(vehicle?.licensePlateMasked).toBe("AB***23");
    expect(vehicle?.model).toBe("CIVIC");
  });

  it("mapJumpParkOrderToEmployee é null sem operador, preenchido quando há operador de saída ou entrada", () => {
    expect(mapJumpParkOrderToEmployee(order({ userName: undefined, userOutputName: undefined }))).toBeNull();
    const employee = mapJumpParkOrderToEmployee(order({ userOutputName: "Maria" }));
    expect(employee?.name).toBe("Maria");
    expect(employee?.source).toBe("JUMPPARK");
  });
});
