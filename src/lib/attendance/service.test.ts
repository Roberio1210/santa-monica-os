import { describe, expect, it } from "vitest";
import {
  addTechnicalRecommendation,
  advanceServiceOrderStatus,
  createServiceOrderFromApprovedServices,
  fetchManagerBoard,
  fetchServiceCatalog,
  fetchServiceVisitContext,
  registerQuickCustomerAndVehicle,
  saveDiagnosticStep,
  searchByPhoneOrPlate,
  setServiceOrderStatus,
  startAttendance,
} from "@/lib/attendance/service";
import { emptyExteriorAssessment, emptyInteriorAssessment } from "@/lib/attendance/types";

/**
 * Testa contra `getAttendanceRepository()`, que em ambiente de teste (sem DATABASE_URL) sempre
 * resolve para `MemoryAttendanceRepository` — mesmo padrão já usado pelos outros módulos do
 * projeto (finance, inventory).
 */

describe("registerQuickCustomerAndVehicle", () => {
  it("cria cliente e veículo novos quando nenhum dos dois existe", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({
      customerName: "Roberio",
      customerPhone: "48999990001",
      vehiclePlate: "AAA1B11",
      vehicleBrand: "Toyota",
      vehicleModel: "Corolla",
    });
    expect(customer.name).toBe("Roberio");
    expect(vehicle.plate).toBe("AAA1B11");
    expect(vehicle.customerId).toBe(customer.id);
  });

  it("reaproveita cliente existente pelo telefone, nunca duplica", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Cliente A", customerPhone: "48999990002", vehiclePlate: "BBB2C22" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Cliente A (nome digitado de novo)", customerPhone: "48999990002", vehiclePlate: "CCC3D33" });
    expect(second.customer.id).toBe(first.customer.id);
  });

  it("reaproveita veículo existente do mesmo cliente pela placa, nunca duplica", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Cliente B", customerPhone: "48999990003", vehiclePlate: "DDD4E44" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Cliente B", customerPhone: "48999990003", vehiclePlate: "DDD4E44" });
    expect(second.vehicle.id).toBe(first.vehicle.id);
  });
});

describe("searchByPhoneOrPlate", () => {
  it("encontra cliente pelo telefone e retorna histórico honesto (vazio para cliente novo)", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({ customerName: "Busca Telefone", customerPhone: "48999990010", vehiclePlate: "EEE5F55" });
    const result = await searchByPhoneOrPlate("48999990010");
    expect(result?.customer.id).toBe(customer.id);
    expect(result?.history.lastVisitAt).toBeNull();
    expect(result?.history.activeProtections).toEqual([]);
  });

  it("encontra cliente pela placa do veículo", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({ customerName: "Busca Placa", customerPhone: "48999990011", vehiclePlate: "FFF6G66" });
    const result = await searchByPhoneOrPlate("FFF6G66");
    expect(result?.customer.id).toBe(customer.id);
    expect(result?.matchedVehicleId).toBeDefined();
  });

  it("busca sem correspondência retorna null, nunca inventa um cliente", async () => {
    const result = await searchByPhoneOrPlate("48900000000");
    expect(result).toBeNull();
  });
});

describe("fluxo completo de atendimento", () => {
  it("do atendimento até a Ordem de Serviço com status inicial correto", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Fluxo Completo", customerPhone: "48999990020", vehiclePlate: "GGG7H77" });
    const visit = await startAttendance(customer.id, vehicle.id, 42000);

    const exterior = emptyExteriorAssessment();
    exterior.pintura = { condition: "regular", problems: [{ type: "riscos", severity: "moderada" }] };
    const diagnostic = await saveDiagnosticStep(visit.id, exterior, emptyInteriorAssessment(), "Cliente relatou uso frequente em estrada.");
    expect(diagnostic.exterior.pintura.condition).toBe("regular");

    const recommendation = await addTechnicalRecommendation(visit.id, "polimento", "Riscos leves visíveis na lateral direita.");
    expect(recommendation.category).toBe("polimento");

    const catalog = await fetchServiceCatalog();
    expect(catalog.length).toBeGreaterThan(0);

    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);
    expect(order.status).toBe("aguardando_execucao");
    expect(order.items).toHaveLength(1);

    const context = await fetchServiceVisitContext(visit.id);
    expect(context?.order?.id).toBe(order.id);
    expect(context?.recommendations).toHaveLength(1);
  });

  it("nunca cria Ordem de Serviço sem nenhum serviço aprovado", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Sem Aprovação", customerPhone: "48999990021", vehiclePlate: "HHH8I88" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await expect(createServiceOrderFromApprovedServices(visit.id, [])).rejects.toThrow();
  });
});

describe("status da Ordem de Serviço", () => {
  it("avança na sequência correta até o status final", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Status", customerPhone: "48999990030", vehiclePlate: "III9J99" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    expect(order.status).toBe("aguardando_execucao");
    const step2 = await advanceServiceOrderStatus(order.id, "aguardando_execucao");
    expect(step2.status).toBe("em_execucao");
    const step3 = await advanceServiceOrderStatus(order.id, "em_execucao");
    expect(step3.status).toBe("aguardando_conferencia");
  });

  it("gerente pode corrigir manualmente para qualquer status", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Correção Manual", customerPhone: "48999990031", vehiclePlate: "JJJ0K00" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);
    const corrected = await setServiceOrderStatus(order.id, "pronto_entrega");
    expect(corrected.status).toBe("pronto_entrega");
  });

  it("não avança além do status final", async () => {
    await expect(advanceServiceOrderStatus("qualquer-id", "entregue")).rejects.toThrow();
  });
});

describe("fetchManagerBoard", () => {
  it("agrupa ordens ativas por status e nunca inclui Entregue nas colunas", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Painel", customerPhone: "48999990040", vehiclePlate: "KKK1L11" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const board = await fetchManagerBoard();
    expect(board.columns.map((c) => c.status)).toEqual(["aguardando_execucao", "em_execucao", "aguardando_conferencia", "pronto_entrega"]);
    const aguardando = board.columns.find((c) => c.status === "aguardando_execucao");
    expect(aguardando?.orders.some((o) => o.customerName === "Painel")).toBe(true);
  });
});
