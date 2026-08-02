import { describe, expect, it } from "vitest";
import { deriveManagerAlerts, EXECUTION_ALERT_MINUTES, CONFERENCIA_ALERT_MINUTES, PRONTO_ALERT_MINUTES, DIAGNOSTICO_PENDENTE_ALERT_MINUTES } from "@/lib/manager-assistant/alerts";
import type { ManagerBoardOrder } from "@/lib/attendance/types";

const NOW = new Date("2026-08-02T15:00:00Z");

function order(overrides: Partial<ManagerBoardOrder>): ManagerBoardOrder {
  return {
    serviceOrderId: "o1",
    status: "recebido",
    customerId: "c1",
    vehicleId: "veh1",
    visitId: "visit1",
    customerName: "João",
    vehicleModel: "Argo",
    vehiclePlate: "ABC1234",
    updatedAt: "2026-08-02T10:00:00Z",
    visitCreatedAt: "2026-08-02T10:00:00Z",
    serviceNames: ["Lavação"],
    totalValue: 0,
    ...overrides,
  };
}

describe("deriveManagerAlerts", () => {
  it("regra 1: execução acima de 3h vira alerta crítico, dentro do limite não", () => {
    const acima = order({ serviceOrderId: "o1", status: "em_execucao", updatedAt: "2026-08-02T11:00:00Z" });
    const dentro = order({ serviceOrderId: "o2", status: "em_execucao", updatedAt: "2026-08-02T13:00:00Z" });
    const alerts = deriveManagerAlerts({ activeOrders: [acima, dentro], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "execucao_atraso", level: "critico", serviceOrderId: "o1" });
    expect(minutesOf(alerts[0].occurredAt)).toBeGreaterThan(EXECUTION_ALERT_MINUTES);
  });

  it("regra 2: conferência acima de 30min vira alerta de atenção", () => {
    const acima = order({ serviceOrderId: "o1", status: "aguardando_conferencia", updatedAt: "2026-08-02T14:20:00Z" });
    const alerts = deriveManagerAlerts({ activeOrders: [acima], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "conferencia_atraso", level: "atencao" });
    expect(minutesOf(alerts[0].occurredAt)).toBeGreaterThan(CONFERENCIA_ALERT_MINUTES);
  });

  it("regra 3: pronto acima de 2h vira alerta de atenção", () => {
    const acima = order({ serviceOrderId: "o1", status: "pronto_entrega", updatedAt: "2026-08-02T12:00:00Z" });
    const alerts = deriveManagerAlerts({ activeOrders: [acima], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "pronto_atraso", level: "atencao" });
    expect(minutesOf(alerts[0].occurredAt)).toBeGreaterThan(PRONTO_ALERT_MINUTES);
  });

  it("regra 4: ordem ativa sem serviços aprovados vira alerta crítico, recebido/diagnostico não contam", () => {
    const semServicos = order({ serviceOrderId: "o1", status: "em_execucao", updatedAt: "2026-08-02T14:50:00Z", serviceNames: [] });
    const recebidoSemServicos = order({ serviceOrderId: "o2", status: "recebido", serviceNames: [] });
    const alerts = deriveManagerAlerts({ activeOrders: [semServicos, recebidoSemServicos], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "sem_servicos", level: "critico", serviceOrderId: "o1" });
  });

  it("regra 5: ordem entregue sem valor vira alerta crítico", () => {
    const semValor = order({ serviceOrderId: "o1", status: "entregue", totalValue: 0 });
    const comValor = order({ serviceOrderId: "o2", status: "entregue", totalValue: 80 });
    const alerts = deriveManagerAlerts({ activeOrders: [], deliveredToday: [semValor, comValor], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "sem_valor", serviceOrderId: "o1" });
  });

  it("regra 6: diagnóstico pendente acima de 30min vira alerta de atenção", () => {
    const pendente = order({ serviceOrderId: "o1", status: "recebido", visitCreatedAt: "2026-08-02T14:20:00Z" });
    const alerts = deriveManagerAlerts({ activeOrders: [], deliveredToday: [], recebidoWithoutDiagnostic: [pendente] }, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "diagnostico_pendente", level: "atencao" });
    expect(minutesOf(alerts[0].occurredAt)).toBeGreaterThan(DIAGNOSTICO_PENDENTE_ALERT_MINUTES);
  });

  it("nunca inventa alerta sem ultrapassar o limiar real", () => {
    const dentro = order({ serviceOrderId: "o1", status: "em_execucao", updatedAt: "2026-08-02T14:00:00Z" });
    const alerts = deriveManagerAlerts({ activeOrders: [dentro], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts).toHaveLength(0);
  });

  it("ordena por gravidade primeiro, depois pelo tempo da ocorrência", () => {
    const atencaoAntiga = order({ serviceOrderId: "o1", status: "aguardando_conferencia", updatedAt: "2026-08-02T14:00:00Z" }); // 60min
    const criticoRecente = order({ serviceOrderId: "o2", status: "em_execucao", updatedAt: "2026-08-02T11:00:00Z" }); // 4h
    const criticoAntigo = order({ serviceOrderId: "o3", status: "em_execucao", updatedAt: "2026-08-02T09:00:00Z" }); // 6h
    const alerts = deriveManagerAlerts({ activeOrders: [atencaoAntiga, criticoRecente, criticoAntigo], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts.map((a) => a.serviceOrderId)).toEqual(["o3", "o2", "o1"]);
  });

  it("dedupeKey é estável e único por ordem e tipo, base da idempotência das notificações", () => {
    const acima = order({ serviceOrderId: "o1", status: "em_execucao", updatedAt: "2026-08-02T11:00:00Z" });
    const alerts = deriveManagerAlerts({ activeOrders: [acima], deliveredToday: [], recebidoWithoutDiagnostic: [] }, NOW);
    expect(alerts[0].dedupeKey).toBe("execucao_atraso:o1");
  });
});

function minutesOf(iso: string): number {
  return (NOW.getTime() - Date.parse(iso)) / 60_000;
}
