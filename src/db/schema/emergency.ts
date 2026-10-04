import { boolean, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { active, id, notes, source, timestamps } from "./common";

/**
 * Módulo Emergência — Fase 1 (04/10/2026): só contatos e protocolos operacionais configuráveis.
 * Registro de ocorrências, anexos, seguro em tabela e alertas ficam para fases posteriores (ver
 * docs/emergency-module.md). O resumo da apólice desta fase vive em
 * `src/lib/emergency/insurance.ts` (mesmo padrão de `COMPANY_INFO`), não no banco.
 */

export const emergencyPriorityEnum = pgEnum("emergency_priority", ["critica", "alta", "normal"]);

/**
 * Contatos de emergência administráveis — nunca hardcoded em componente. `key` é a chave natural
 * estável dos contatos criados pelo seed (idempotência do `db:seed:emergency` e vínculo com
 * `emergency_protocols.priority_contact_id`); contatos criados depois pela tela administrativa
 * ficam com `key` nulo. `category` é texto livre validado na aplicação
 * (`EMERGENCY_CONTACT_CATEGORIES`), mesmo raciocínio de `technical_recommendations.category`: a
 * lista deve poder crescer sem migration. Todos os campos de contato são opcionais — um contato
 * conhecido sem telefone confirmado existe, mas nunca renderiza botão de ligar.
 */
export const emergencyContacts = pgTable("emergency_contacts", {
  id: id(),
  key: text("key").unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  phone: text("phone"),
  phoneAlt: text("phone_alt"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  website: text("website"),
  priority: emergencyPriorityEnum("priority").notNull().default("normal"),
  displayOrder: integer("display_order").notNull().default(0),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Protocolo operacional por tipo de emergência ("O que aconteceu?"). `potentialCoverageKeys`
 * referencia as chaves de `INSURANCE_COVERAGES` (`src/lib/emergency/insurance.ts`) — sempre
 * exibidas como "cobertura potencialmente aplicável", nunca como confirmação. `warning` é o aviso
 * destacado do protocolo (ex.: ressalvas da RC Garagista). `notes` = observações.
 */
export const emergencyProtocols = pgTable("emergency_protocols", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  priority: emergencyPriorityEnum("priority").notNull().default("normal"),
  displayOrder: integer("display_order").notNull().default(0),
  warning: text("warning"),
  potentialCoverageKeys: text("potential_coverage_keys").array().notNull().default([]),
  priorityContactId: uuid("priority_contact_id").references(() => emergencyContacts.id),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Passos ordenados de um protocolo. O UNIQUE (protocol_id, position) garante a ordem sem
 * ambiguidade e também serve de índice para a única consulta feita aqui (passos de um protocolo).
 */
export const emergencyProtocolSteps = pgTable(
  "emergency_protocol_steps",
  {
    id: id(),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => emergencyProtocols.id),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    isCritical: boolean("is_critical").notNull().default(false),
    ...timestamps,
  },
  (table) => [unique("emergency_protocol_steps_protocol_position_unique").on(table.protocolId, table.position)],
);
