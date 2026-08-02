import { numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, notes, source, timestamps } from "./common";
import { customers, vehicles } from "./crm";
import { serviceOrders } from "./attendance";

/**
 * Assistente Operacional do Gerente — duas tabelas novas, aditivas. Tudo o mais (alertas,
 * prioridades, clientes que merecem atenção) é derivado ao vivo dos dados já existentes em
 * `attendance.ts`, nunca duplicado aqui (ver src/lib/manager-assistant/).
 */

export const discountReasonEnum = pgEnum("discount_reason", [
  "recorrente",
  "pacote",
  "negociacao",
  "cortesia",
  "correcao",
  "campanha",
  "outro",
]);

/**
 * Registro de desconto — o gerente concede sem aprovação prévia do proprietário (regra de
 * negócio desta missão); o proprietário só é informado depois, via `notifications`.
 * `originalValue`/`finalValue` são um retrato do momento do registro, nunca recalculados depois
 * (o preço de tabela do serviço pode mudar no futuro sem afetar um desconto já concedido).
 */
export const serviceOrderDiscounts = pgTable("service_order_discounts", {
  id: id(),
  serviceOrderId: uuid("service_order_id")
    .notNull()
    .references(() => serviceOrders.id),
  originalValue: numeric("original_value", { precision: 12, scale: 2 }).notNull(),
  finalValue: numeric("final_value", { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
  reason: discountReasonEnum("reason").notNull(),
  /** Nome de quem aplicou, digitado no momento — não há sessão/login real ainda (ver docs/database-and-auth-setup-guide.md). */
  appliedBy: text("applied_by").notNull(),
  notes: notes(),
  source: source(),
  ...timestamps,
});

export const notificationPriorityEnum = pgEnum("notification_priority", ["critico", "atencao", "informativo"]);
export const notificationRecipientEnum = pgEnum("notification_recipient", ["proprietario", "gerente", "ambos"]);
export const notificationStatusEnum = pgEnum("notification_status", ["nova", "vista", "resolvida"]);

/**
 * Central de notificações internas. `dedupeKey` é única — cada condição real (ex.: "ordem X em
 * execução há mais de 3h") só cria uma linha, mesmo detectada de novo em ciclos seguintes
 * (`ON CONFLICT DO NOTHING` na escrita, ver postgres-repository.ts). Isso é o que garante
 * "nunca duplicar notificação para o mesmo evento".
 */
export const notifications = pgTable("notifications", {
  id: id(),
  type: text("type").notNull(),
  priority: notificationPriorityEnum("priority").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  sourceOrderId: uuid("source_order_id").references(() => serviceOrders.id),
  sourceCustomerId: uuid("source_customer_id").references(() => customers.id),
  sourceVehicleId: uuid("source_vehicle_id").references(() => vehicles.id),
  recipient: notificationRecipientEnum("recipient").notNull(),
  status: notificationStatusEnum("status").notNull().default("nova"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  ...timestamps,
});
