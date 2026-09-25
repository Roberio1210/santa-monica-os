import { describe, expect, it, vi } from "vitest";
import { registerQuickCustomerAndVehicle, startAttendance, startServiceOrder, setServiceOrderStatus, fetchServiceCatalog, createServiceOrderFromApprovedServices } from "@/lib/attendance/service";
import { fetchManagerAssistant, fetchOwnerSummary, registerDiscount, markNotificationSeen } from "@/lib/manager-assistant/service";
import { getManagerAssistantRepository } from "@/lib/manager-assistant/repository-factory";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/** Testa contra os repositórios em memória (sem DATABASE_URL) — mesmo padrão de attendance/service.test.ts. */

describe("fetchManagerAssistant", () => {
  it("uma ordem recém-movida para aguardando_conferencia conta na prioridade, mas não vira alerta antes do limiar", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Assistente Conferência", customerPhone: "48999990200", vehiclePlate: "ASS1T01" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const order = await startServiceOrder(visit.id);
    await setServiceOrderStatus(order.id, "aguardando_conferencia");

    const result = await fetchManagerAssistant();
    // Mudou de status agora mesmo — não passou dos 30 minutos, não deve gerar o alerta de atraso (ver alerts.test.ts para o limiar).
    expect(result.alerts.some((a) => a.serviceOrderId === order.id && a.type === "conferencia_atraso")).toBe(false);
    expect(result.priorities.some((p) => p.id === "aguardando_conferencia" && p.count >= 1)).toBe(true);
  });

  it("clientes de hoje aparecem em clientsAttention só quando há sinal real", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({
      customerName: "Assistente Atenção",
      customerPhone: "48999990201",
      vehiclePlate: "ASS2T02",
    });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    const result = await fetchManagerAssistant();
    // Cliente novo, sem observações/recomendações/recorrência — não deve aparecer.
    expect(result.clientsAttention.some((c) => c.customerId === customer.id)).toBe(false);
  });
});

describe("registerDiscount", () => {
  it("registra desconto sem aprovação prévia e gera notificação para o proprietário", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Assistente Desconto", customerPhone: "48999990202", vehiclePlate: "ASS3T03" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);
    const catalog = await fetchServiceCatalog();
    await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const discount = await registerDiscount({
      serviceOrderId: visit.id,
      originalValue: 200,
      finalValue: 150,
      reason: "cortesia",
      appliedBy: "Vinicius",
    });

    expect(discount.discountAmount).toBe(50);
    expect(discount.discountPercent).toBe(25);

    const repo = getManagerAssistantRepository();
    const notifications = await repo.listNotifications({ recipient: "proprietario" });
    expect(notifications.some((n) => n.dedupeKey === `desconto_concedido:${discount.id}`)).toBe(true);
  });

  it("nunca registra desconto quando o valor final não é menor que o original", async () => {
    await expect(registerDiscount({ serviceOrderId: "o1", originalValue: 100, finalValue: 100, reason: "outro", appliedBy: "Vinicius" })).rejects.toThrow();
  });

  it("descontos de hoje aparecem no resumo do proprietário", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Assistente Resumo", customerPhone: "48999990203", vehiclePlate: "ASS4T04" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    await registerDiscount({ serviceOrderId: visit.id, originalValue: 300, finalValue: 250, reason: "recorrente", appliedBy: "Vinicius" });

    const today = saoPauloDateISO();
    const summary = await fetchOwnerSummary(today);
    expect(summary.descontos.count).toBeGreaterThanOrEqual(1);
    expect(summary.descontos.totalAmount).toBeGreaterThanOrEqual(50);
  });
});

describe("markNotificationSeen", () => {
  it("atualiza o status da notificação sem apagar o registro original", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Assistente Visto", customerPhone: "48999990204", vehiclePlate: "ASS5T05" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    await registerDiscount({ serviceOrderId: visit.id, originalValue: 100, finalValue: 80, reason: "outro", appliedBy: "Vinicius" });

    const repo = getManagerAssistantRepository();
    const [notification] = await repo.listNotifications({ recipient: "proprietario", limit: 1 });
    expect(notification.status).toBe("nova");

    const updated = await markNotificationSeen(notification.id);
    expect(updated.status).toBe("vista");
    expect(updated.id).toBe(notification.id);
  });
});

/**
 * Fase Network Transfer do Neon (25/09/2026) — regressão do N+1 eliminado em `fetchManagerAssistant`
 * (clientsAttention) e em `computeLiveAlerts` (diagnóstico da coluna "recebido"). Testa contra o
 * repositório em memória real (sem DATABASE_URL/TEST_DATABASE_URL — mesmo padrão do resto deste
 * arquivo), espionando os métodos BATCH do repositório para provar que a contagem de chamadas não
 * cresce com o número de clientes/pedidos — nunca 1 consulta por cliente/pedido.
 */
describe("fetchManagerAssistant — sem N+1 (Fase Network Transfer, 25/09/2026)", () => {
  it("clientsAttention: com 4 clientes distintos com pedido hoje, cada método batch é chamado exatamente 1 vez (nunca 1 por cliente)", async () => {
    const repo = getAttendanceRepository();
    for (let i = 0; i < 4; i++) {
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `NT Batch Cliente ${i}`, customerPhone: `4899990500${i}`, vehiclePlate: `NTB${i}T01` });
      const visit = await startAttendance(customer.id, vehicle.id, null);
      await startServiceOrder(visit.id);
    }

    const spies = {
      getCustomersByIds: vi.spyOn(repo, "getCustomersByIds"),
      listVehiclesForCustomers: vi.spyOn(repo, "listVehiclesForCustomers"),
      listVisitsForCustomers: vi.spyOn(repo, "listVisitsForCustomers"),
      listRecommendationsForVisits: vi.spyOn(repo, "listRecommendationsForVisits"),
      listServiceOrdersForVisits: vi.spyOn(repo, "listServiceOrdersForVisits"),
    };

    await fetchManagerAssistant();

    for (const [name, spy] of Object.entries(spies)) {
      expect(spy, `${name} deveria ser chamado exatamente 1 vez, nunca 1 por cliente`).toHaveBeenCalledTimes(1);
    }

    Object.values(spies).forEach((s) => s.mockRestore());
  });

  it("clientsAttention: com 1 cliente ou com 5 clientes, cada método batch continua chamado exatamente 1 vez (prova de que a contagem não escala com N)", async () => {
    const repo = getAttendanceRepository();

    async function criarClienteComPedidoHoje(label: string) {
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `NT Escala ${label}`, customerPhone: `489999051${label.padStart(2, "0")}`, vehiclePlate: `NTE${label}T1` });
      const visit = await startAttendance(customer.id, vehicle.id, null);
      await startServiceOrder(visit.id);
    }

    await criarClienteComPedidoHoje("A");
    const spyFor1 = vi.spyOn(repo, "listVisitsForCustomers");
    await fetchManagerAssistant();
    expect(spyFor1).toHaveBeenCalledTimes(1);
    spyFor1.mockRestore();

    for (const label of ["B", "C", "D", "E"]) await criarClienteComPedidoHoje(label);
    const spyFor5 = vi.spyOn(repo, "listVisitsForCustomers");
    await fetchManagerAssistant();
    expect(spyFor5).toHaveBeenCalledTimes(1); // mesmo 1 chamada com 5 clientes no total — nunca 5
    spyFor5.mockRestore();
  });

  it("computeLiveAlerts: diagnóstico da coluna 'recebido' é buscado em lote — listDiagnosticsForVisits nunca escala com o número de pedidos", async () => {
    const repo = getAttendanceRepository();
    for (let i = 0; i < 3; i++) {
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `NT Diag Cliente ${i}`, customerPhone: `4899990520${i}`, vehiclePlate: `NTD${i}T01` });
      const visit = await startAttendance(customer.id, vehicle.id, null);
      await startServiceOrder(visit.id); // fica em "recebido", sem diagnóstico
    }

    const spy = vi.spyOn(repo, "listDiagnosticsForVisits");
    await fetchManagerAssistant();
    // Chamado 2x por execução (1x em computeLiveAlerts para a coluna "recebido", 1x no bloco de
    // clientsAttention para o histórico dos clientes do dia) — nunca 1x por pedido/cliente. As duas
    // chamadas são independentes e cada uma já é O(1); nunca deveria crescer além disso.
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
