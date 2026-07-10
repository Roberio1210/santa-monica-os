import { date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

/**
 * Modelo de destino para a sincronização descrita em docs/jumppark-sync-strategy.md.
 * Nenhum cron ou sincronização automática é executado nesta tarefa — apenas a estrutura.
 */
export const jumpParkServiceOrders = pgTable("jumppark_service_orders", {
  id: id(),
  /** serviceOrderId do JumpPark — chave de idempotência (unique). */
  externalId: text("external_id").notNull().unique(),
  code: text("code"),
  entryTime: text("entry_time"),
  exitTime: text("exit_time"),
  orderDate: date("order_date").notNull(),
  plateMasked: text("plate_masked"),
  vehicleModel: text("vehicle_model"),
  clientName: text("client_name"),
  clientPhoneMasked: text("client_phone_masked"),
  parkingAmount: numeric("parking_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  servicesAmount: numeric("services_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"),
  situation: text("situation"),
  /**
   * JSON bruto da ordem, SOMENTE quando já sanitizado (sem telefone/nome completo em claro) —
   * ver docs/jumppark-sync-strategy.md, seção "Preservação do payload bruto". Null por padrão.
   */
  rawPayloadSanitized: jsonb("raw_payload_sanitized"),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "partial", "error"]);

export const jumpParkSyncLogs = pgTable("jumppark_sync_logs", {
  id: id(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: syncStatusEnum("status").notNull().default("running"),
  dateRangeStart: date("date_range_start").notNull(),
  dateRangeEnd: date("date_range_end").notNull(),
  ordersFetched: integer("orders_fetched"),
  ordersInserted: integer("orders_inserted"),
  ordersUpdated: integer("orders_updated"),
  attempt: integer("attempt").notNull().default(1),
  /** Mensagem de erro sanitizada — nunca deve conter token, header de autorização ou payload bruto. */
  errorMessage: text("error_message"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
