import { describe, expect, it } from "vitest";
import { summarizeHome } from "@/lib/attendance/home";
import type { Goal } from "@/lib/goals/types";
import type { ManagerBoardColumn, ServiceOrder } from "@/lib/attendance/types";

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

describe("summarizeHome — contagens", () => {
  it("mapeia cada coluna do painel para o campo correto", () => {
    const summary = summarizeHome({
      boardColumns: [column("aguardando_execucao", 3), column("em_execucao", 1), column("aguardando_conferencia", 2), column("pronto_entrega", 0)],
      todaysOrders: [],
      servicePriceById: {},
      activeGoal: null,
    });
    expect(summary.countsToday).toEqual({ aguardandoExecucao: 3, emExecucao: 1, aguardandoConferencia: 2, prontoEntrega: 0 });
  });
});

describe("summarizeHome — faturamento do dia", () => {
  it("soma o preço padrão dos serviços das ordens de hoje", () => {
    const summary = summarizeHome({
      boardColumns: [],
      todaysOrders: [order("o1", ["s1", "s2"]), order("o2", ["s1"])],
      servicePriceById: { s1: 80, s2: 350 },
      activeGoal: null,
    });
    expect(summary.dailyRevenue).toBe(510);
  });

  it("serviço sem preço cadastrado conta como 0, nunca inventa valor", () => {
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [order("o1", ["sem-preco"])], servicePriceById: {}, activeGoal: null });
    expect(summary.dailyRevenue).toBe(0);
  });
});

describe("summarizeHome — meta do dia", () => {
  it("é null quando não há meta ativa, nunca uma meta inventada", () => {
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [], servicePriceById: {}, activeGoal: null });
    expect(summary.goal).toBeNull();
  });

  it("divide a meta mensal real pelos dias do período", () => {
    const goal: Goal = { id: "g1", area: "consolidado", label: "Meta de Agosto", targetAmount: 31000, periodStart: "2026-08-01", periodEnd: "2026-08-31", bonusTiers: [] };
    const summary = summarizeHome({ boardColumns: [], todaysOrders: [], servicePriceById: {}, activeGoal: goal });
    expect(summary.goal).toEqual({ label: "Meta de Agosto", dailyTargetEstimate: 1000 });
  });
});
