import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications, serviceOrderDiscounts } from "@/db/schema";
import type { ManagerAssistantRepository } from "@/lib/manager-assistant/repository";
import type {
  CreateDiscountInput,
  CreateNotificationInput,
  Discount,
  DiscountReason,
  Notification,
  NotificationPriority,
  NotificationRecipient,
  NotificationStatus,
} from "@/lib/manager-assistant/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

function toDiscount(row: typeof serviceOrderDiscounts.$inferSelect): Discount {
  return {
    id: row.id,
    serviceOrderId: row.serviceOrderId,
    originalValue: Number(row.originalValue),
    finalValue: Number(row.finalValue),
    discountAmount: Number(row.discountAmount),
    discountPercent: Number(row.discountPercent),
    reason: row.reason as DiscountReason,
    appliedBy: row.appliedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority as NotificationPriority,
    title: row.title,
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    sourceOrderId: row.sourceOrderId,
    sourceCustomerId: row.sourceCustomerId,
    sourceVehicleId: row.sourceVehicleId,
    recipient: row.recipient as NotificationRecipient,
    status: row.status as NotificationStatus,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Implementação real, ativada automaticamente quando DATABASE_URL está configurada (ver repository-factory.ts). */
export class PostgresManagerAssistantRepository implements ManagerAssistantRepository {
  private db() {
    const db = getDb();
    if (!db) {
      throw new Error("PostgresManagerAssistantRepository foi instanciado sem DATABASE_URL configurada — bug em repository-factory.ts.");
    }
    return db;
  }

  async createDiscount(input: CreateDiscountInput): Promise<Discount> {
    const discountAmount = round2(input.originalValue - input.finalValue);
    const discountPercent = input.originalValue > 0 ? round2((discountAmount / input.originalValue) * 100) : 0;
    const [row] = await this.db()
      .insert(serviceOrderDiscounts)
      .values({
        serviceOrderId: input.serviceOrderId,
        originalValue: input.originalValue.toFixed(2),
        finalValue: input.finalValue.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        discountPercent: discountPercent.toFixed(2),
        reason: input.reason,
        appliedBy: input.appliedBy,
        notes: input.notes ?? null,
        source: "manual",
      })
      .returning();
    return toDiscount(row);
  }

  async listDiscountsInRange(fromIso: string, toIso: string): Promise<Discount[]> {
    const rows = await this.db().select().from(serviceOrderDiscounts).orderBy(desc(serviceOrderDiscounts.createdAt));
    const inRange = rows.filter((r) => {
      const day = saoPauloDateISO(r.createdAt);
      return day >= fromIso && day <= toIso;
    });
    return inRange.map(toDiscount);
  }

  async upsertNotificationIfAbsent(input: CreateNotificationInput): Promise<void> {
    await this.db()
      .insert(notifications)
      .values({
        type: input.type,
        priority: input.priority,
        title: input.title,
        description: input.description,
        occurredAt: new Date(input.occurredAt),
        sourceOrderId: input.sourceOrderId ?? null,
        sourceCustomerId: input.sourceCustomerId ?? null,
        sourceVehicleId: input.sourceVehicleId ?? null,
        recipient: input.recipient,
        status: "nova",
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey });
  }

  async listNotifications(params: { recipient?: NotificationRecipient; statuses?: NotificationStatus[]; limit?: number }): Promise<Notification[]> {
    const conditions = [];
    if (params.recipient) {
      conditions.push(or(eq(notifications.recipient, params.recipient), eq(notifications.recipient, "ambos")));
    }
    if (params.statuses && params.statuses.length > 0) {
      conditions.push(inArray(notifications.status, params.statuses));
    }

    const query = this.db()
      .select()
      .from(notifications)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notifications.occurredAt));

    const rows = params.limit ? await query.limit(params.limit) : await query;
    return rows.map(toNotification);
  }

  async markNotificationStatus(id: string, status: NotificationStatus): Promise<Notification> {
    const [row] = await this.db().update(notifications).set({ status, updatedAt: new Date() }).where(eq(notifications.id, id)).returning();
    if (!row) throw new Error(`Notificação ${id} não encontrada.`);
    return toNotification(row);
  }
}
