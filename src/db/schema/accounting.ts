import { boolean, date, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { accountsPayable, accountsReceivable, accountTransfers, cashMovements, costCenters, financialCategories, partners, suppliers } from "./finance";

/**
 * Contabilidade Gerencial (12/07/2026) — classifica lançamentos reais (accounts_payable/
 * accounts_receivable/cash_movements/account_transfers) numa linha da DRE gerencial, sem
 * duplicar nem alterar essas tabelas. Aditivo, reaproveita tudo do módulo Financeiro/Contas a
 * Pagar/Contas a Receber/Fluxo de Caixa.
 */
export const dreLineEnum = pgEnum("dre_line", [
  "receita_bruta",
  "deducoes_receita",
  "custos_diretos",
  "despesas_operacionais",
  "resultado_financeiro",
  "tributos",
  "fora_dre",
]);

export const financialNatureEnum = pgEnum("financial_nature", [
  "receita_operacional",
  "deducao_receita",
  "custo_direto",
  "despesa_operacional",
  "resultado_financeiro",
  "investimento",
  "ativo",
  "passivo",
  "transferencia",
  "aporte",
  "retirada",
  "reembolso",
  "nao_classificavel",
]);

export const classificationOriginEnum = pgEnum("classification_origin", [
  "regra_automatica",
  "herdada_categoria",
  "herdada_fornecedor",
  "herdada_cliente",
  "manual",
  "importacao_futura",
  "pendente",
]);

/**
 * Classificação gerencial de UM lançamento real — exatamente uma das 4 colunas abaixo é
 * preenchida (reaproveita o padrão já usado em `payments`/`cash_movements`, que também têm
 * múltiplas FKs nullable para a mesma linha representar origens diferentes). Unique em cada
 * FK garante no máximo uma classificação vigente por lançamento; histórico de alteração vive em
 * `audit_logs` (entityType="financial_classification"), nunca duplicado aqui.
 */
export const financialClassifications = pgTable("financial_classifications", {
  id: id(),
  accountsPayableId: uuid("accounts_payable_id").unique().references(() => accountsPayable.id),
  accountsReceivableId: uuid("accounts_receivable_id").unique().references(() => accountsReceivable.id),
  cashMovementId: uuid("cash_movement_id").unique().references(() => cashMovements.id),
  accountTransferId: uuid("account_transfer_id").unique().references(() => accountTransfers.id),
  dreLine: dreLineEnum("dre_line").notNull(),
  nature: financialNatureEnum("nature").notNull(),
  /** Redundante com dreLine="fora_dre" só por conveniência de query — sempre mantido em sincronia pela aplicação. */
  includeInDre: boolean("include_in_dre").notNull().default(true),
  origin: classificationOriginEnum("origin").notNull(),
  reviewNeeded: boolean("review_needed").notNull().default(false),
  /** Texto livre — sem sessão de usuário real ainda (mesmo padrão de inventory_movements.responsible). */
  classifiedBy: text("classified_by"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

export const classificationMatchTypeEnum = pgEnum("classification_match_type", [
  "fornecedor",
  "parceiro",
  "categoria",
  "palavra_chave",
]);

/**
 * Regra automática de classificação — idempotente via externalId. `enabled` controla se a regra
 * está em uso (distinto de `active`, o soft-delete padrão do sistema). Quando o motor de
 * classificação roda, aplica a primeira regra `enabled` cujo critério bate com o lançamento.
 */
export const classificationRules = pgTable("classification_rules", {
  id: id(),
  matchType: classificationMatchTypeEnum("match_type").notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  partnerId: uuid("partner_id").references(() => partners.id),
  categoryId: uuid("category_id").references(() => financialCategories.id),
  /** Buscado como substring (case-insensitive) na descrição do lançamento. */
  keyword: text("keyword"),
  dreLine: dreLineEnum("dre_line").notNull(),
  nature: financialNatureEnum("nature").notNull(),
  suggestedCostCenterId: uuid("suggested_cost_center_id").references(() => costCenters.id),
  includeInDre: boolean("include_in_dre").notNull().default(true),
  reviewNeeded: boolean("review_needed").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  active: active(),
  source: source(),
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Rateio de despesas compartilhadas entre centros de custo. Nenhum percentual real é definido
 * nesta etapa (nenhuma allocation_rules foi semeada) — enquanto não houver uma vigente para uma
 * despesa, ela permanece 100% em Administrativo e a UI mostra aviso de "rateio não definido".
 */
export const allocationRules = pgTable("allocation_rules", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveUntil: date("effective_until"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/** Soma de percentage de todas as linhas de uma allocation_rules deve ser 100 — validado na aplicação. */
export const allocationRuleShares = pgTable("allocation_rule_shares", {
  id: id(),
  allocationRuleId: uuid("allocation_rule_id").notNull().references(() => allocationRules.id),
  costCenterId: uuid("cost_center_id").notNull().references(() => costCenters.id),
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
  notes: notes(),
  ...timestamps,
});

export const accountingPeriodStatusEnum = pgEnum("accounting_period_status", ["aberto", "em_revisao", "fechado", "reaberto"]);

/**
 * Fechamento gerencial mensal — nunca automático. Histórico de transições (fechar/reabrir) vive
 * em audit_logs (entityType="accounting_period"); esta tabela guarda só o estado atual.
 */
export const accountingPeriods = pgTable("accounting_periods", {
  id: id(),
  /** Formato "YYYY-MM", único. */
  competenceMonth: text("competence_month").notNull().unique(),
  status: accountingPeriodStatusEnum("status").notNull().default("aberto"),
  closedBy: text("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedBy: text("reopened_by"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenJustification: text("reopen_justification"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
