import { boolean, date, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./common";

/**
 * Memória Organizacional do Santa Monica OS (Sprint 5.0, Z3B, decisão do usuário — ampliação do
 * escopo original "Memória Operacional"). Aditivo puro, nenhuma tabela existente é tocada.
 *
 * Quatro tabelas, uma por tipo de memória persistida (a Memória Conversacional, Z3A, nunca é
 * persistida — não tem tabela):
 * - `director_daily_snapshots` — Memória Operacional (leitura diária por Diretor, retenção curta).
 * - `director_learnings` — Memória Organizacional (pipeline Observação→Aprendizado→Conhecimento).
 * - `strategic_memory_items` — Memória Estratégica (metas/projetos/objetivos, nunca expira).
 * - `organizational_beliefs` — Crenças da empresa (princípios permanentes).
 *
 * `director_daily_snapshots` segue o padrão de `audit_logs` (imutável por natureza — é uma
 * fotografia do dia, nunca "editada" pelo usuário) mas com `updatedAt` porque uma mesma linha É
 * legitimamente sobrescrita quando a Diretoria roda mais de uma vez no mesmo dia (idempotência por
 * `directorId` + `snapshotDate`, nunca duplicada).
 */

export const directorIdEnum = pgEnum("director_id", ["financeiro", "comercial", "marketing", "operacoes", "estoque", "rh", "estrategico", "inteligencia"]);

export const factDirectionEnum = pgEnum("fact_direction", ["aumento", "queda", "estavel", "indisponivel"]);

export const confidenceLevelEnum = pgEnum("confidence_level", ["alta", "media", "baixa"]);

// --- 1. Memória Operacional ---

export const directorDailySnapshots = pgTable(
  "director_daily_snapshots",
  {
    id: id(),
    directorId: directorIdEnum("director_id").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    summary: text("summary").notNull(),
    metricKey: text("metric_key"),
    direction: factDirectionEnum("direction").notNull(),
    evidenceFactKeys: jsonb("evidence_fact_keys").notNull().$type<string[]>(),
    ...timestamps,
  },
  (table) => [uniqueIndex("director_daily_snapshots_director_date_idx").on(table.directorId, table.snapshotDate)],
);

// --- 2. Memória Estratégica ---

export const strategicMemoryItemKindEnum = pgEnum("strategic_memory_item_kind", ["meta", "projeto", "objetivo"]);

export const strategicMemoryItems = pgTable(
  "strategic_memory_items",
  {
    id: id(),
    kind: strategicMemoryItemKindEnum("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidenceFactKeys: jsonb("evidence_fact_keys").notNull().$type<string[]>(),
    active: boolean("active").notNull().default(true),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).defaultNow().notNull(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("strategic_memory_items_kind_title_idx").on(table.kind, table.title)],
);

// --- 3. Memória Organizacional (pipeline de aprendizado) ---

export const learningStatusEnum = pgEnum("learning_status", ["observacao", "aprendizado", "conhecimento", "descartado"]);

/**
 * `expiresAt` nulo a partir de `"aprendizado"` — só a etapa `"observacao"` expira por tempo
 * (decisão do usuário: "observações sem confirmação devem expirar automaticamente"; a partir daí,
 * só evidência contrária muda o status, nunca a passagem do tempo).
 */
export const directorLearnings = pgTable(
  "director_learnings",
  {
    id: id(),
    directorId: directorIdEnum("director_id").notNull(),
    signalKey: text("signal_key").notNull(),
    description: text("description").notNull(),
    evidenceFactKeys: jsonb("evidence_fact_keys").notNull().$type<string[]>(),
    status: learningStatusEnum("status").notNull().default("observacao"),
    confidenceLevel: confidenceLevelEnum("confidence_level").notNull(),
    confirmationCount: integer("confirmation_count").notNull().default(1),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).defaultNow().notNull(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    limitations: jsonb("limitations").notNull().$type<string[]>(),
    ...timestamps,
  },
  (table) => [uniqueIndex("director_learnings_director_signal_idx").on(table.directorId, table.signalKey)],
);

// --- 4. Crenças da empresa ---

export const organizationalBeliefs = pgTable("organizational_beliefs", {
  id: id(),
  statement: text("statement").notNull().unique(),
  category: text("category"),
  source: text("source").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
