import { minutesSince } from "@/lib/attendance/timers";
import { SERVICE_ORDER_STATUS_LABELS, type ManagerBoardOrder } from "@/lib/attendance/types";

/**
 * Lógica pura da Central de Operações (`/operacao`) — nunca faz I/O. Dois blocos:
 * `buildDayTimeline` (feed cronológico) e `deriveOperationalAlerts` (alertas por tempo excedido).
 */

export interface OperationsEvent {
  id: string;
  time: string;
  label: string;
}

function orderLabel(order: ManagerBoardOrder): string {
  return `${order.customerName ?? "Cliente"} · ${order.vehicleModel ?? "Veículo"}`;
}

/**
 * Feed do dia — no máximo 2 eventos reais por ordem, nunca a história completa: o schema só
 * guarda o status atual + `updatedAt` da última mudança (sem tabela de transições), então
 * eventos intermediários já sobrescritos (ex.: "entrou em diagnóstico" de uma ordem já entregue)
 * não são reconstruíveis e não são inventados aqui.
 *  - "chegou": sempre, em `visitCreatedAt`.
 *  - "{status atual}": só quando a ordem já saiu de `recebido` — em `updatedAt`, o momento real da
 *    última mudança de status.
 */
export function buildDayTimeline(ordersToday: ManagerBoardOrder[]): OperationsEvent[] {
  const events: OperationsEvent[] = [];

  for (const order of ordersToday) {
    events.push({ id: `${order.serviceOrderId}-chegada`, time: order.visitCreatedAt, label: `${orderLabel(order)} chegou` });

    if (order.status !== "recebido") {
      events.push({ id: `${order.serviceOrderId}-status`, time: order.updatedAt, label: `${orderLabel(order)}: ${SERVICE_ORDER_STATUS_LABELS[order.status]}` });
    }
  }

  return events.sort((a, b) => a.time.localeCompare(b.time));
}

export type AlertStage = "execucao" | "conferencia" | "pronto";

export interface OperationalAlert {
  id: string;
  serviceOrderId: string;
  stage: AlertStage;
  minutes: number;
  message: string;
}

/** Limiares do enunciado da missão — fixos, não configuráveis nesta versão. */
export const EXECUTION_ALERT_MINUTES = 180;
export const CONFERENCIA_ALERT_MINUTES = 30;
export const PRONTO_ALERT_MINUTES = 120;

function alertsForStage(orders: ManagerBoardOrder[], stage: AlertStage, thresholdMinutes: number, verb: string, now: Date): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  for (const order of orders) {
    const minutes = minutesSince(order.updatedAt, now);
    if (minutes > thresholdMinutes) {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      const duration = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}min` : ""}` : `${mins}min`;
      alerts.push({ id: `${stage}-${order.serviceOrderId}`, serviceOrderId: order.serviceOrderId, stage, minutes, message: `${orderLabel(order)} ${verb} há ${duration}` });
    }
  }
  return alerts;
}

/**
 * Alertas só a partir dos horários reais das ordens já carregadas para as seções Execução/
 * Conferência/Prontos — nenhuma consulta nova, nunca um alerta inventado. Mais urgente primeiro.
 */
export function deriveOperationalAlerts(
  params: { emExecucao: ManagerBoardOrder[]; aguardandoConferencia: ManagerBoardOrder[]; prontos: ManagerBoardOrder[] },
  now: Date = new Date(),
): OperationalAlert[] {
  const alerts = [
    ...alertsForStage(params.emExecucao, "execucao", EXECUTION_ALERT_MINUTES, "em execução", now),
    ...alertsForStage(params.aguardandoConferencia, "conferencia", CONFERENCIA_ALERT_MINUTES, "aguardando conferência", now),
    ...alertsForStage(params.prontos, "pronto", PRONTO_ALERT_MINUTES, "pronto aguardando retirada", now),
  ];
  return alerts.sort((a, b) => b.minutes - a.minutes);
}
