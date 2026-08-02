import { describe, expect, it } from "vitest";
import { buildDayTimeline, deriveOperationalAlerts, EXECUTION_ALERT_MINUTES, CONFERENCIA_ALERT_MINUTES, PRONTO_ALERT_MINUTES } from "@/lib/attendance/operationsCenter";
import type { ManagerBoardOrder } from "@/lib/attendance/types";

const NOW = new Date("2026-08-02T15:00:00Z");

function order(overrides: Partial<ManagerBoardOrder>): ManagerBoardOrder {
  return {
    serviceOrderId: "o1",
    status: "recebido",
    customerName: "João",
    vehicleModel: "Argo",
    vehiclePlate: "ABC1234",
    updatedAt: "2026-08-02T10:00:00Z",
    visitCreatedAt: "2026-08-02T10:00:00Z",
    serviceNames: [],
    totalValue: 0,
    ...overrides,
  };
}

describe("buildDayTimeline", () => {
  it("sempre gera o evento de chegada", () => {
    const events = buildDayTimeline([order({ serviceOrderId: "o1", visitCreatedAt: "2026-08-02T08:01:00Z" })]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ time: "2026-08-02T08:01:00Z", label: "João · Argo chegou" });
  });

  it("gera um segundo evento com o status atual quando a ordem já saiu de recebido", () => {
    const events = buildDayTimeline([order({ serviceOrderId: "o1", status: "em_execucao", visitCreatedAt: "2026-08-02T08:01:00Z", updatedAt: "2026-08-02T08:18:00Z" })]);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ time: "2026-08-02T08:18:00Z", label: "João · Argo: Em Execução" });
  });

  it("nunca inventa os estágios intermediários já sobrescritos — só chegada + status atual", () => {
    // Uma ordem já entregue passou por diagnóstico/execução/conferência, mas só sabemos o status final.
    const events = buildDayTimeline([order({ serviceOrderId: "o1", status: "entregue", visitCreatedAt: "2026-08-02T08:01:00Z", updatedAt: "2026-08-02T09:52:00Z" })]);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.label)).toEqual(["João · Argo chegou", "João · Argo: Entregue"]);
  });

  it("ordena cronologicamente entre várias ordens", () => {
    const events = buildDayTimeline([
      order({ serviceOrderId: "o2", customerName: "Maria", visitCreatedAt: "2026-08-02T09:00:00Z" }),
      order({ serviceOrderId: "o1", customerName: "João", visitCreatedAt: "2026-08-02T08:01:00Z" }),
    ]);
    expect(events.map((e) => e.label)).toEqual(["João · Argo chegou", "Maria · Argo chegou"]);
  });
});

describe("deriveOperationalAlerts", () => {
  it("alerta execução acima de 3 horas, não abaixo", () => {
    const acima = order({ serviceOrderId: "o1", status: "em_execucao", updatedAt: "2026-08-02T11:00:00Z" }); // 4h
    const abaixo = order({ serviceOrderId: "o2", status: "em_execucao", updatedAt: "2026-08-02T13:00:00Z" }); // 2h
    const alerts = deriveOperationalAlerts({ emExecucao: [acima, abaixo], aguardandoConferencia: [], prontos: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].serviceOrderId).toBe("o1");
    expect(alerts[0].minutes).toBeGreaterThan(EXECUTION_ALERT_MINUTES);
  });

  it("alerta conferência acima de 30 minutos", () => {
    const acima = order({ serviceOrderId: "o1", status: "aguardando_conferencia", updatedAt: "2026-08-02T14:20:00Z" }); // 40min
    const alerts = deriveOperationalAlerts({ emExecucao: [], aguardandoConferencia: [acima], prontos: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].stage).toBe("conferencia");
    expect(alerts[0].minutes).toBeGreaterThan(CONFERENCIA_ALERT_MINUTES);
  });

  it("alerta pronto aguardando retirada acima de 2 horas", () => {
    const acima = order({ serviceOrderId: "o1", status: "pronto_entrega", updatedAt: "2026-08-02T12:00:00Z" }); // 3h
    const alerts = deriveOperationalAlerts({ emExecucao: [], aguardandoConferencia: [], prontos: [acima] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].stage).toBe("pronto");
    expect(alerts[0].minutes).toBeGreaterThan(PRONTO_ALERT_MINUTES);
  });

  it("nunca inventa alerta sem ultrapassar o limiar", () => {
    const dentro = order({ serviceOrderId: "o1", status: "em_execucao", updatedAt: "2026-08-02T14:00:00Z" }); // 1h
    const alerts = deriveOperationalAlerts({ emExecucao: [dentro], aguardandoConferencia: [], prontos: [] }, NOW);
    expect(alerts).toHaveLength(0);
  });

  it("ordena do mais urgente para o menos urgente", () => {
    const leve = order({ serviceOrderId: "o1", status: "aguardando_conferencia", updatedAt: "2026-08-02T14:20:00Z" }); // 40min > 30min
    const grave = order({ serviceOrderId: "o2", status: "em_execucao", updatedAt: "2026-08-02T09:00:00Z" }); // 6h > 3h
    const alerts = deriveOperationalAlerts({ emExecucao: [grave], aguardandoConferencia: [leve], prontos: [] }, NOW);
    expect(alerts.map((a) => a.serviceOrderId)).toEqual(["o2", "o1"]);
  });
});
