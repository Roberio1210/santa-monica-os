import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { customers, vehicles } from "./crm";
import { services } from "./inventory";

/**
 * Planejamento Operacional (Missão 20) — primeira fonte real de agendamento do sistema.
 * `/agenda` (src/app/agenda) continua mock/demonstrativo; este módulo é o real, conforme
 * proposto em docs/business-core-architecture-rfc.md §4.5 (Appointment como estágio anterior
 * ao OperationalOrder — aqui ainda sem a conversão automática, fora de escopo desta missão).
 */
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "agendado",
  "confirmado",
  "em_andamento",
  "concluido",
  "cancelado",
  "reagendado",
]);

/**
 * Um agendamento = um serviço esperado para um cliente/veículo num horário futuro. `expectedDurationMinutes`
 * fica nulo até ser informado manualmente (nunca inventado) — a UI pode sugerir a média histórica real
 * do serviço quando houver amostra suficiente, mas o gerente sempre pode ajustar.
 */
export const appointments = pgTable("appointments", {
  id: id(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  expectedDurationMinutes: integer("expected_duration_minutes"),
  status: appointmentStatusEnum("status").notNull().default("agendado"),
  notes: text("notes"),
  active: active(),
  source: source(),
  externalId: externalId(),
  ...timestamps,
});

/**
 * Configuração real de capacidade diária, definida pelo gerente — mesmo padrão de `goals`
 * (src/db/schema/goals.ts): nada hardcoded, nunca inventado. Enquanto não houver linha ativa,
 * o Planejamento Operacional informa honestamente "capacidade ainda não calculável" em vez de
 * assumir um valor. No máximo uma linha ativa por vez (a mais recente vale).
 */
export const operationalCapacityConfig = pgTable("operational_capacity_config", {
  id: id(),
  boxesCount: integer("boxes_count").notNull(),
  dailyOperatingMinutes: integer("daily_operating_minutes").notNull(),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});
