import { randomUUID } from "node:crypto";
import type { ManagerAssistantRepository } from "@/lib/manager-assistant/repository";
import type { CreateDiscountInput, CreateNotificationInput, Discount, Notification, NotificationRecipient, NotificationStatus } from "@/lib/manager-assistant/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

function nowIso(): string {
  return new Date().toISOString();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Implementação em memória — mesmo papel de `MemoryAttendanceRepository`, só para desenvolvimento sem Postgres. */
export class MemoryManagerAssistantRepository implements ManagerAssistantRepository {
  private discounts = new Map<string, Discount>();
  private notifications = new Map<string, Notification>();
  private notificationsByDedupeKey = new Map<string, string>();

  async createDiscount(input: CreateDiscountInput): Promise<Discount> {
    const discountAmount = round2(input.originalValue - input.finalValue);
    const discountPercent = input.originalValue > 0 ? round2((discountAmount / input.originalValue) * 100) : 0;
    const discount: Discount = {
      id: randomUUID(),
      serviceOrderId: input.serviceOrderId,
      originalValue: round2(input.originalValue),
      finalValue: round2(input.finalValue),
      discountAmount,
      discountPercent,
      reason: input.reason,
      appliedBy: input.appliedBy,
      notes: input.notes ?? null,
      createdAt: nowIso(),
    };
    this.discounts.set(discount.id, discount);
    return discount;
  }

  async listDiscountsInRange(fromIso: string, toIso: string): Promise<Discount[]> {
    return Array.from(this.discounts.values())
      .filter((d) => {
        const day = saoPauloDateISO(new Date(d.createdAt));
        return day >= fromIso && day <= toIso;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upsertNotificationIfAbsent(input: CreateNotificationInput): Promise<void> {
    if (this.notificationsByDedupeKey.has(input.dedupeKey)) return;
    const notification: Notification = {
      id: randomUUID(),
      type: input.type,
      priority: input.priority,
      title: input.title,
      description: input.description,
      occurredAt: input.occurredAt,
      sourceOrderId: input.sourceOrderId ?? null,
      sourceCustomerId: input.sourceCustomerId ?? null,
      sourceVehicleId: input.sourceVehicleId ?? null,
      recipient: input.recipient,
      status: "nova",
      dedupeKey: input.dedupeKey,
      createdAt: nowIso(),
    };
    this.notifications.set(notification.id, notification);
    this.notificationsByDedupeKey.set(input.dedupeKey, notification.id);
  }

  async listNotifications(params: { recipient?: NotificationRecipient; statuses?: NotificationStatus[]; limit?: number }): Promise<Notification[]> {
    let list = Array.from(this.notifications.values());
    if (params.recipient) {
      list = list.filter((n) => n.recipient === params.recipient || n.recipient === "ambos");
    }
    if (params.statuses) {
      const statuses = params.statuses;
      list = list.filter((n) => statuses.includes(n.status));
    }
    list = list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return params.limit ? list.slice(0, params.limit) : list;
  }

  async markNotificationStatus(id: string, status: NotificationStatus): Promise<Notification> {
    const notification = this.notifications.get(id);
    if (!notification) throw new Error(`Notificação ${id} não encontrada.`);
    const updated: Notification = { ...notification, status };
    this.notifications.set(id, updated);
    return updated;
  }
}
