import { integer, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { customers, vehicles } from "./crm";
import { services } from "./inventory";

/**
 * Módulo Atendimento Inteligente — primeira funcionalidade de produção do Santa Monica OS.
 * Fluxo: cliente chega → atendimento (service_visits) → diagnóstico técnico (diagnostics,
 * diagnostic_photos) → recomendações (technical_recommendations) → serviços aprovados viram
 * Ordem de Serviço (service_orders, service_order_items).
 */

/** Uma visita/atendimento — o "guarda-chuva" que liga cliente, veículo, diagnóstico e ordem. */
export const serviceVisits = pgTable("service_visits", {
  id: id(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  /** Quilometragem informada neste atendimento — histórico correto (não sobrescreve o veículo). */
  mileageAtVisit: integer("mileage_at_visit"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Avaliação técnica de um atendimento. `exteriorAssessment`/`interiorAssessment` são jsonb —
 * mesmo padrão já usado no projeto para estrutura semi-fixa e sujeita a evolução (ex.:
 * `stone_reconciliation_results.favorable_signals`, `operational_orders.metadata` planejado).
 * Formato de cada área: `{ condition: "excelente"|"boa"|"regular"|"ruim"|null, problems:
 * [{ type: string, severity: "leve"|"moderada"|"severa" }] }` — ver src/lib/attendance/types.ts.
 */
export const diagnostics = pgTable("diagnostics", {
  id: id(),
  serviceVisitId: uuid("service_visit_id")
    .notNull()
    .unique()
    .references(() => serviceVisits.id),
  exteriorAssessment: jsonb("exterior_assessment").notNull().$type<Record<string, unknown>>(),
  interiorAssessment: jsonb("interior_assessment").notNull().$type<Record<string, unknown>>(),
  observations: text("observations"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

export const photoStageEnum = pgEnum("photo_stage", ["antes", "durante", "depois"]);

/**
 * Estrutura preparada para fotos (antes/durante/depois) — sem upload real nesta sprint. `url`
 * fica nulo até existir um mecanismo de upload; a tabela já está pronta para recebê-lo depois
 * sem migration nova.
 */
export const diagnosticPhotos = pgTable("diagnostic_photos", {
  id: id(),
  diagnosticId: uuid("diagnostic_id")
    .notNull()
    .references(() => diagnostics.id),
  stage: photoStageEnum("stage").notNull(),
  url: text("url"),
  caption: text("caption"),
  active: active(),
  source: source(),
  ...timestamps,
});

/**
 * Recomendação técnica — nunca é venda. Categoria livre (texto, não enum): a lista de exemplos
 * dada pelo negócio mistura causas (chuva ácida) com serviços (vitrificação) e deve poder crescer
 * sem migration, mesmo padrão já adotado para `service_category` no domínio operacional.
 */
export const technicalRecommendations = pgTable("technical_recommendations", {
  id: id(),
  serviceVisitId: uuid("service_visit_id")
    .notNull()
    .references(() => serviceVisits.id),
  category: text("category").notNull(),
  observations: text("observations"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Pipeline operacional completo — a ordem nasce junto com a visita (status `recebido`), muito
 * antes de ter serviços aprovados. `diagnostico` cobre o intervalo entre o diagnóstico salvo e a
 * aprovação dos serviços. Nunca pula etapa: cada avanço é um toque só (ver status.ts).
 */
export const serviceOrderStatusEnum = pgEnum("service_order_status", [
  "recebido",
  "diagnostico",
  "aguardando_execucao",
  "em_execucao",
  "aguardando_conferencia",
  "pronto_entrega",
  "entregue",
]);

/** Criada assim que a visita começa (status `recebido`, sem itens) — nunca excluída, só o status/itens mudam. */
export const serviceOrders = pgTable("service_orders", {
  id: id(),
  serviceVisitId: uuid("service_visit_id")
    .notNull()
    .references(() => serviceVisits.id),
  status: serviceOrderStatusEnum("status").notNull().default("recebido"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/** Um serviço aprovado dentro de uma Ordem — referencia o catálogo real (`services`, Estoque). */
export const serviceOrderItems = pgTable("service_order_items", {
  id: id(),
  serviceOrderId: uuid("service_order_id")
    .notNull()
    .references(() => serviceOrders.id),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  notes: notes(),
  active: active(),
  source: source(),
  ...timestamps,
});
