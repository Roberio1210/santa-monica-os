import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Colunas repetidas em praticamente toda tabela do sistema, conforme decisão de arquitetura:
 * createdAt, updatedAt, active, source, externalId, notes (quando aplicável).
 * `id` é sempre um uuid gerado pelo Postgres (`gen_random_uuid()`, extensão pgcrypto/pgcore
 * nativa do Postgres 13+, disponível tanto no Neon quanto no Vercel Postgres).
 */
export const id = () => uuid("id").defaultRandom().primaryKey();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const active = () => boolean("active").default(true).notNull();

/** Origem do registro: de onde o dado veio (manual, seed, jumppark, import, etc.). */
export const source = () => text("source").notNull().default("manual");

/** Identificador estável na fonte externa (ex.: id do JumpPark, slug do item de estoque). */
export const externalId = () => text("external_id");

export const notes = () => text("notes");
