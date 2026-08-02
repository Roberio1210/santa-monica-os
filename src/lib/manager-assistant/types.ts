/**
 * Assistente Operacional do Gerente — tipos do domínio novo (descontos + notificações internas).
 * Alertas, prioridades e "clientes que merecem atenção" são derivados ao vivo dos dados do
 * módulo Atendimento (ver alerts.ts/priorities.ts/clientAttention.ts) e não têm tipos de
 * persistência próprios.
 */

export type DiscountReason = "recorrente" | "pacote" | "negociacao" | "cortesia" | "correcao" | "campanha" | "outro";

export const DISCOUNT_REASONS: DiscountReason[] = ["recorrente", "pacote", "negociacao", "cortesia", "correcao", "campanha", "outro"];

export const DISCOUNT_REASON_LABELS: Record<DiscountReason, string> = {
  recorrente: "Cliente recorrente",
  pacote: "Fechamento de pacote",
  negociacao: "Negociação comercial",
  cortesia: "Cortesia",
  correcao: "Correção de falha",
  campanha: "Campanha",
  outro: "Outro",
};

/** `originalValue`/`finalValue` são o retrato do momento do registro — nunca recalculados depois. */
export interface Discount {
  id: string;
  serviceOrderId: string;
  originalValue: number;
  finalValue: number;
  discountAmount: number;
  discountPercent: number;
  reason: DiscountReason;
  appliedBy: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateDiscountInput {
  serviceOrderId: string;
  originalValue: number;
  finalValue: number;
  reason: DiscountReason;
  appliedBy: string;
  notes?: string | null;
}

export type NotificationPriority = "critico" | "atencao" | "informativo";
export const NOTIFICATION_PRIORITIES: NotificationPriority[] = ["critico", "atencao", "informativo"];
export const NOTIFICATION_PRIORITY_LABELS: Record<NotificationPriority, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
};

export type NotificationRecipient = "proprietario" | "gerente" | "ambos";
export type NotificationStatus = "nova" | "vista" | "resolvida";

export interface Notification {
  id: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  description: string;
  occurredAt: string;
  sourceOrderId: string | null;
  sourceCustomerId: string | null;
  sourceVehicleId: string | null;
  recipient: NotificationRecipient;
  status: NotificationStatus;
  dedupeKey: string;
  createdAt: string;
}

export interface CreateNotificationInput {
  type: string;
  priority: NotificationPriority;
  title: string;
  description: string;
  occurredAt: string;
  sourceOrderId?: string | null;
  sourceCustomerId?: string | null;
  sourceVehicleId?: string | null;
  recipient: NotificationRecipient;
  /** Chave estável por evento (ex.: `execucao_atraso:{orderId}`) — garante que a mesma condição nunca gere duas notificações. */
  dedupeKey: string;
}
