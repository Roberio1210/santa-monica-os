import { minutesSince } from "@/lib/attendance/timers";
import type { ManagerBoardOrder } from "@/lib/attendance/types";
import type { NotificationPriority } from "@/lib/manager-assistant/types";

/**
 * Seção 1 (Atenção Agora) — 6 das 7 regras do enunciado. A regra 7 ("ordem entregue sem
 * conferência registrada") fica de fora: o schema não guarda histórico de transições de status
 * (só o status atual + `updatedAt` da última mudança — ver `attendance/timers.ts`), então não há
 * como comprovar que uma ordem já entregue pulou a conferência. O enunciado permite isso
 * explicitamente ("somente gerar se isso puder ser comprovado pelo pipeline real").
 */

export type AlertType = "execucao_atraso" | "conferencia_atraso" | "pronto_atraso" | "sem_servicos" | "sem_valor" | "diagnostico_pendente";

export interface ManagerAlert {
  dedupeKey: string;
  type: AlertType;
  level: NotificationPriority;
  title: string;
  description: string;
  /** Quando a condição começou — não quando o alerta foi calculado. */
  occurredAt: string;
  serviceOrderId: string;
  customerId: string;
  vehicleId: string;
  customerName: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
}

export const EXECUTION_ALERT_MINUTES = 180;
export const CONFERENCIA_ALERT_MINUTES = 30;
export const PRONTO_ALERT_MINUTES = 120;
export const DIAGNOSTICO_PENDENTE_ALERT_MINUTES = 30;

const OPEN_STATUSES_REQUIRING_SERVICES: ManagerBoardOrder["status"][] = ["aguardando_execucao", "em_execucao", "aguardando_conferencia", "pronto_entrega"];

function alertBase(order: ManagerBoardOrder): Pick<ManagerAlert, "serviceOrderId" | "customerId" | "vehicleId" | "customerName" | "vehicleModel" | "vehiclePlate"> {
  return {
    serviceOrderId: order.serviceOrderId,
    customerId: order.customerId,
    vehicleId: order.vehicleId,
    customerName: order.customerName,
    vehicleModel: order.vehicleModel,
    vehiclePlate: order.vehiclePlate,
  };
}

const LEVEL_RANK: Record<NotificationPriority, number> = { critico: 0, atencao: 1, informativo: 2 };

/**
 * `activeOrders`: todas as ordens não entregues (qualquer estágio). `deliveredToday`: status
 * `entregue` cuja entrega caiu hoje. `recebidoWithoutDiagnostic`: ordens `recebido` cuja visita
 * ainda não tem diagnóstico salvo — calculado com I/O em `service.ts`, nunca aqui.
 */
export function deriveManagerAlerts(
  params: { activeOrders: ManagerBoardOrder[]; deliveredToday: ManagerBoardOrder[]; recebidoWithoutDiagnostic: ManagerBoardOrder[] },
  now: Date = new Date(),
): ManagerAlert[] {
  const alerts: ManagerAlert[] = [];

  for (const order of params.activeOrders) {
    if (order.status === "em_execucao" && minutesSince(order.updatedAt, now) > EXECUTION_ALERT_MINUTES) {
      alerts.push({
        dedupeKey: `execucao_atraso:${order.serviceOrderId}`,
        type: "execucao_atraso",
        level: "critico",
        title: "Veículo em execução há mais de 3 horas",
        description: "Verificar andamento.",
        occurredAt: order.updatedAt,
        ...alertBase(order),
      });
    }

    if (order.status === "aguardando_conferencia" && minutesSince(order.updatedAt, now) > CONFERENCIA_ALERT_MINUTES) {
      alerts.push({
        dedupeKey: `conferencia_atraso:${order.serviceOrderId}`,
        type: "conferencia_atraso",
        level: "atencao",
        title: "Veículo aguardando conferência",
        description: "Realizar inspeção final.",
        occurredAt: order.updatedAt,
        ...alertBase(order),
      });
    }

    if (order.status === "pronto_entrega" && minutesSince(order.updatedAt, now) > PRONTO_ALERT_MINUTES) {
      alerts.push({
        dedupeKey: `pronto_atraso:${order.serviceOrderId}`,
        type: "pronto_atraso",
        level: "atencao",
        title: "Veículo pronto aguardando retirada",
        description: "Confirmar com o cliente.",
        occurredAt: order.updatedAt,
        ...alertBase(order),
      });
    }

    if (OPEN_STATUSES_REQUIRING_SERVICES.includes(order.status) && order.serviceNames.length === 0) {
      alerts.push({
        dedupeKey: `sem_servicos:${order.serviceOrderId}`,
        type: "sem_servicos",
        level: "critico",
        title: "Atendimento aberto sem serviços aprovados",
        description: "Revisar lançamento.",
        occurredAt: order.updatedAt,
        ...alertBase(order),
      });
    }
  }

  for (const order of params.deliveredToday) {
    if (order.totalValue === 0) {
      alerts.push({
        dedupeKey: `sem_valor:${order.serviceOrderId}`,
        type: "sem_valor",
        level: "critico",
        title: "Ordem finalizada sem valor registrado",
        description: "Revisar lançamento.",
        occurredAt: order.updatedAt,
        ...alertBase(order),
      });
    }
  }

  for (const order of params.recebidoWithoutDiagnostic) {
    if (minutesSince(order.visitCreatedAt, now) > DIAGNOSTICO_PENDENTE_ALERT_MINUTES) {
      alerts.push({
        dedupeKey: `diagnostico_pendente:${order.serviceOrderId}`,
        type: "diagnostico_pendente",
        level: "atencao",
        title: "Diagnóstico pendente neste atendimento",
        description: "Iniciar o diagnóstico técnico.",
        occurredAt: order.visitCreatedAt,
        ...alertBase(order),
      });
    }
  }

  return alerts.sort((a, b) => {
    const levelDiff = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (levelDiff !== 0) return levelDiff;
    return minutesSince(b.occurredAt, now) - minutesSince(a.occurredAt, now);
  });
}
