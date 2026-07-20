import { date, integer, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { active, id, notes, source, timestamps } from "./common";

/**
 * Metas de faturamento (Sprint 4.0 — "Gerente Operacional"). Nada hardcoded: valores vêm daqui,
 * nunca de uma constante no código, para o Zézinho nunca inventar uma meta.
 *
 * Uma meta vale para uma área (lavação/estacionamento/consolidado) e um período (`periodStart`/
 * `periodEnd`, tipicamente um mês) — quando o período atual não tem nenhuma meta cadastrada, o
 * Zézinho deve dizer isso honestamente ("não há meta configurada para este período"), nunca
 * assumir a do mês anterior. Gestão de metas via tela (criar/editar) fica para uma sprint
 * futura — esta é só a camada de dado + leitura.
 */
export const goalAreaEnum = pgEnum("goal_area", ["lavacao", "estacionamento", "consolidado"]);

export const goals = pgTable(
  "goals",
  {
    id: id(),
    area: goalAreaEnum("area").notNull(),
    label: text("label").notNull(),
    targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    active: active(),
    source: source(),
    notes: notes(),
    ...timestamps,
  },
  (table) => [uniqueIndex("goals_area_period_start_idx").on(table.area, table.periodStart)],
);

/**
 * Faixas de premiação ao atingir determinado patamar — ex.: R$30.000 (meta base, prêmio de
 * R$1.000 divididos entre colaboradores), +R$500 ao atingir R$35.000, +R$1.000 ao atingir
 * R$40.000. `description` é texto livre para "divididos entre três colaboradores" — este
 * sprint não modela colaboradores individualmente (RH ainda não tem dado real, ver
 * docs/hr-module-architecture.md), só o valor e a descrição da premiação.
 */
export const goalBonusTiers = pgTable("goal_bonus_tiers", {
  id: id(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  thresholdAmount: numeric("threshold_amount", { precision: 12, scale: 2 }).notNull(),
  bonusAmount: numeric("bonus_amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  /** Ordem de exibição — faixas em ordem crescente de patamar. */
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});
