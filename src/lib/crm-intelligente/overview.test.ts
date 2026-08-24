import { describe, expect, it } from "vitest";
import { listCustomerOverviews } from "@/lib/crm-intelligente/overview";
import { createServiceOrderFromApprovedServices, registerQuickCustomerAndVehicle, startAttendance, startServiceOrder } from "@/lib/attendance/service";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";

/**
 * Missão de Performance do CRM — `listCustomerOverviews` foi reescrita para buscar
 * vehicles/visits/orders/recommendations em LOTE (poucas consultas fixas) em vez de uma consulta
 * por cliente (que levava ~9 minutos com 331 clientes reais em produção, achado real da missão de
 * confirmação Z4). O risco real de uma reescrita assim é cruzar dado de um cliente com outro na
 * hora de agrupar em memória — estes testes travam especificamente isso: nenhum vazamento entre
 * clientes, mesmo resultado por cliente de antes.
 *
 * Testa contra `getAttendanceRepository()`, que em ambiente de teste (sem DATABASE_URL) sempre
 * resolve para `MemoryAttendanceRepository` — mesmo padrão de `attendance/service.test.ts`.
 */

describe("listCustomerOverviews — busca em lote nunca cruza dado entre clientes", () => {
  it("dois clientes com veículos e serviços diferentes: cada um recebe só o seu próprio dado", async () => {
    const a = await registerQuickCustomerAndVehicle({ customerName: "Ana Lote", customerPhone: "48900000001", vehiclePlate: "LOT1A11", vehicleBrand: "Honda", vehicleModel: "Civic" });
    const b = await registerQuickCustomerAndVehicle({ customerName: "Bruno Lote", customerPhone: "48900000002", vehiclePlate: "LOT1B22", vehicleBrand: "VW", vehicleModel: "Gol" });

    const visitA = await startAttendance(a.customer.id, a.vehicle.id, null);
    await startServiceOrder(visitA.id);
    await createServiceOrderFromApprovedServices(visitA.id, ["dev-lavacao"]);

    const visitB = await startAttendance(b.customer.id, b.vehicle.id, null);
    await startServiceOrder(visitB.id);
    await createServiceOrderFromApprovedServices(visitB.id, ["dev-vitrificacao"]);

    const overviews = await listCustomerOverviews();
    const entryA = overviews.find((o) => o.customer.id === a.customer.id);
    const entryB = overviews.find((o) => o.customer.id === b.customer.id);

    expect(entryA?.primaryVehicle?.id).toBe(a.vehicle.id);
    expect(entryB?.primaryVehicle?.id).toBe(b.vehicle.id);
    expect(entryA?.lastServiceNames).toEqual(["Lavação Completa"]);
    expect(entryB?.lastServiceNames).toEqual(["Vitrificação de Pintura"]);
    // Nunca o veículo/serviço de um aparece no outro (o risco real de um bug de agrupamento).
    expect(entryA?.primaryVehicle?.id).not.toBe(entryB?.primaryVehicle?.id);
    expect(entryA?.lastServiceNames).not.toEqual(entryB?.lastServiceNames);
  });

  it("cliente sem nenhum veículo/visita/ordem: nunca herda dado de outro cliente, sempre valores vazios reais", async () => {
    const withData = await registerQuickCustomerAndVehicle({ customerName: "Carla Lote", customerPhone: "48900000003", vehiclePlate: "LOT1C33", vehicleBrand: "Fiat", vehicleModel: "Argo" });
    const visit = await startAttendance(withData.customer.id, withData.vehicle.id, null);
    await startServiceOrder(visit.id);
    await createServiceOrderFromApprovedServices(visit.id, ["dev-polimento"]);

    const emptyCustomer = await getAttendanceRepository().createCustomer({ name: "Diego Sem Nada", phone: "48900000004", cpf: null });

    const overviews = await listCustomerOverviews();
    const entryEmpty = overviews.find((o) => o.customer.id === emptyCustomer.id);

    expect(entryEmpty?.primaryVehicle).toBeNull();
    expect(entryEmpty?.lastServiceNames).toEqual([]);
    expect(entryEmpty?.profile.visitCount).toBe(0);
    expect(entryEmpty?.profile.daysSinceLastVisit).toBeNull();
  });

  it("cortesia (desconto) de um cliente nunca aparece como lastCourtesy de outro cliente com pedido no mesmo período", async () => {
    const x = await registerQuickCustomerAndVehicle({ customerName: "Xavier Lote", customerPhone: "48900000005", vehiclePlate: "LOT1X55", vehicleBrand: "Toyota", vehicleModel: "Corolla" });
    const y = await registerQuickCustomerAndVehicle({ customerName: "Yara Lote", customerPhone: "48900000006", vehiclePlate: "LOT1Y66", vehicleBrand: "Hyundai", vehicleModel: "HB20" });

    const visitX = await startAttendance(x.customer.id, x.vehicle.id, null);
    await startServiceOrder(visitX.id);
    await createServiceOrderFromApprovedServices(visitX.id, ["dev-lavacao"]);

    const visitY = await startAttendance(y.customer.id, y.vehicle.id, null);
    await startServiceOrder(visitY.id);
    await createServiceOrderFromApprovedServices(visitY.id, ["dev-higienizacao"]);

    const overviews = await listCustomerOverviews();
    const entryX = overviews.find((o) => o.customer.id === x.customer.id);
    const entryY = overviews.find((o) => o.customer.id === y.customer.id);

    // Nenhum dos dois recebeu cortesia real nesta suíte — o teste garante que a ausência é
    // consistente e nunca "contamina" um cliente com a cortesia (inexistente) de outro.
    expect(entryX?.lastCourtesy).toBeNull();
    expect(entryY?.lastCourtesy).toBeNull();
  });
});
