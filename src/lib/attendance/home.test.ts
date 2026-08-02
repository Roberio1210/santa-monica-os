import { describe, expect, it } from "vitest";
import { summarizeHome } from "@/lib/attendance/home";
import type { Goal } from "@/lib/goals/types";
import type { ManagerBoardColumn, ManagerBoardOrder, ServiceOrder } from "@/lib/attendance/types";

function column(status: ManagerBoardColumn["status"], count: number): ManagerBoardColumn {
  return {
    status,
    label: status,
    orders: Array.from({ length: count }, (_, i) => ({
      serviceOrderId: `o-${status}-${i}`,
      status,
      customerName: null,
      vehicleModel: null,
      vehiclePlate: null,
      updatedAt: "2026-08-01T10:00:00Z",
      visitCreatedAt: "2026-08-01T09:00:00Z",
      serviceNames: [],
      totalValue: 0,
    })),
  };
}

function order(id: string, serviceIds: string[]): ServiceOrder {
  return {
    id,
    serviceVisitId: `v-${id}`,
    status: "aguardando_execucao",
    items: serviceIds.map((serviceId, i) => ({ id: `item-${id}-${i}`, serviceOrderId: id, serviceId, serviceName: "Serviço", notes: null })),
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
  };
}

function delivered(id: string, visitCreatedAt: string, updatedAt: string): ManagerBoardOrder {
  return {
    serviceOrderId: id,
    status: "entregue",
    customerName: null,
    vehicleModel: null,
    vehiclePlate: null,
    updatedAt,
    visitCreatedAt,
    serviceNames: ["Lavação"],
    totalValue: 80,
  };
}

describe("summarizeHome — contagens", () => {
  it("mapeia cada coluna do painel para o campo correto", () => {
    const summary = summarizeHome({
      boardColumns: [
        column("recebido", 2),
        column("diagnostico", 1),
        column("aguardando_execucao", 3),
        column("em_execucao", 1),
        column("aguardando_conferencia", 2),
        column("pronto_entrega", 0),
      ],
      todaysOrders: [],
      deliveredToday: [],
      servicePriceById: {},
      activeGoal: null,
    });
    expect(summary.countsToday).toEqual({ previstos: 2, aguardandoAtendimento: 4, emExecucao: 1, aguardandoConferencia: 2, prontoEntrega: 0, entregue: 0 });
  });

  it("nunca mistura carros de diagnóstico/aguardando execução no balde de previstos", () => {
    const summary = summarizeHome({
      boardColumns: [column("recebido", 5)],
      todaysOrders: [],
      deliveredToday: [],
      servicePriceById: {},
      activeGoal: null,
    });
    expect(summary.countsToday.previstos).toBe(5);
    expect(summary.countsToday.aguardandoAtendimento).toBe(0);
  });

  it("conta entregue a partir de deliveredToday, não do board (que exclui entregue)", () => {
    const summary = summarizeHome({
      boardColumns: [],
      todaysOrders: [],
      deliveredToday: [delivered("d1", "2026-08-01T09:00:00Z", "2026-08-01T10:00:00Z"), delivered("d2", "2026-08-01T09:00:00Z", "2026-08-01T11:00:00Z")],
      servicePriceById: {},
      activeGoal: null,
    });
    expect(summary.countsToday.entregue).toBe(2);
  });
});

describe("summarizeHome — faturamento do dia", () => {
  it("soma o preço padrão dos serviços das ordens de hoje", () => {
    const summary = summarizeHome({
      boardColumns: [],
      todaysOrders: [order("o1", ["s1", "s2"]), order("o2", ["s1"])],
      deliveredToday: [],
      servicePriceById: { s1: 80, s2: 350 },
      activeGoal: null,
    });
    expect(summary.dailyRevenue).toBe(510);
  });

  it("serviço sem preço cadastrado conta como 0, nunca inventa valor", () => {
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [order("o1", ["sem-preco"])], deliveredToday: [], servicePriceById: {}, activeGoal: null });
    expect(summary.dailyRevenue).toBe(0);
  });
});

describe("summarizeHome — ticket médio", () => {
  it("é null quando nenhuma ordem de hoje tem itens ainda, nunca 0", () => {
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [order("o1", [])], deliveredToday: [], servicePriceById: {}, activeGoal: null });
    expect(summary.averageTicket).toBeNull();
  });

  it("é a média do valor das ordens de hoje que já têm itens", () => {
    const summary = summarizeHome({
      boardColumns: [],
      todaysOrders: [order("o1", ["s1"]), order("o2", ["s1", "s2"])],
      deliveredToday: [],
      servicePriceById: { s1: 100, s2: 200 },
      activeGoal: null,
    });
    // o1 = 100, o2 = 300 → média 200
    expect(summary.averageTicket).toBe(200);
  });
});

describe("summarizeHome — tempo médio de atendimento", () => {
  it("é null quando nada foi entregue hoje, nunca estimado a partir de ordens em aberto", () => {
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [], deliveredToday: [], servicePriceById: {}, activeGoal: null });
    expect(summary.averageServiceDurationMinutes).toBeNull();
  });

  it("é a média de minutos entre entrada e entrega das ordens entregues hoje", () => {
    const summary = summarizeHome({
      boardColumns: [],
      todaysOrders: [],
      deliveredToday: [delivered("d1", "2026-08-01T09:00:00Z", "2026-08-01T10:00:00Z"), delivered("d2", "2026-08-01T09:00:00Z", "2026-08-01T11:00:00Z")],
      servicePriceById: {},
      activeGoal: null,
    });
    // d1 = 60min, d2 = 120min → média 90
    expect(summary.averageServiceDurationMinutes).toBe(90);
  });
});

describe("summarizeHome — meta do dia", () => {
  it("é null quando não há meta ativa, nunca uma meta inventada", () => {
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [], deliveredToday: [], servicePriceById: {}, activeGoal: null });
    expect(summary.goal).toBeNull();
  });

  it("divide a meta mensal real pelos dias do período", () => {
    const goal: Goal = { id: "g1", area: "consolidado", label: "Meta de Agosto", targetAmount: 31000, periodStart: "2026-08-01", periodEnd: "2026-08-31", bonusTiers: [] };
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [], deliveredToday: [], servicePriceById: {}, activeGoal: goal });
    expect(summary.goal).toEqual({ label: "Meta de Agosto", dailyTargetEstimate: 1000 });
  });
});
