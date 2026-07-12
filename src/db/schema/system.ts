import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { users } from "./auth";

export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "critical"]);

export const alerts = pgTable("alerts", {
  id: id(),
  type: text("type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("info"),
  message: text("message").notNull(),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  resolved: boolean("resolved").notNull().default(false),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Log de auditoria — registros são imutáveis por natureza, por isso não tem `updatedAt`/`active`
 * (não faz sentido "desativar" um log; se algo precisar ser corrigido, um novo registro é
 * criado, nunca uma edição). Mantém `source`/`notes` para consistência com o restante do
 * modelo, conforme pedido na tarefa.
 */
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  /** Preparado para quando houver contexto real de requisição (sessão de usuário) — hoje sempre null, nunca inventado. */
  ipAddress: text("ip_address"),
  source: source(),
  notes: notes(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
