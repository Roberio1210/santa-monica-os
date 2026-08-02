import type { CreateDiscountInput, CreateNotificationInput, Discount, Notification, NotificationRecipient, NotificationStatus } from "@/lib/manager-assistant/types";

/**
 * Interface única do Assistente do Gerente — mesmo padrão de `AttendanceRepository`: uma
 * interface, duas implementações (`memory` para desenvolvimento sem banco, `postgres` para
 * produção), escolhidas por `repository-factory.ts`.
 */
export interface ManagerAssistantRepository {
  createDiscount(input: CreateDiscountInput): Promise<Discount>;
  /** Descontos registrados (por `createdAt`) dentro do intervalo `[fromIso, toIso]`, mais recente primeiro. */
  listDiscountsInRange(fromIso: string, toIso: string): Promise<Discount[]>;

  /** Insere só se `dedupeKey` ainda não existir — garante que a mesma condição nunca gere duas notificações. */
  upsertNotificationIfAbsent(input: CreateNotificationInput): Promise<void>;
  listNotifications(params: { recipient?: NotificationRecipient; statuses?: NotificationStatus[]; limit?: number }): Promise<Notification[]>;
  markNotificationStatus(id: string, status: NotificationStatus): Promise<Notification>;
}
