import { date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./common";

/**
 * Persistência da integração Stone Conciliação (Sprint 7.0, Z4, decisão do usuário). Aditiva pura
 * — nenhuma tabela existente é tocada. Quatro tabelas, cada uma correspondendo a uma camada já
 * construída nos checkpoints anteriores:
 *
 * - `stone_import_runs` — histórico de importação (uma linha por arquivo diário realmente
 *   buscado, idempotente por `referenceDate` + `layout`).
 * - `stone_normalized_transactions` — versão persistida, por parcela, dos fatos normalizados do
 *   Z2/Z3 (Agenda Financeira), idempotente pela chave externa determinística de `identity.ts`.
 * - `stone_reconciliation_results` — resultados do motor de conciliação Stone × JumpPark (Z3),
 *   persistidos por período.
 * - `stone_divergences` — divergências estruturadas (Z3), com fluxo de revisão humana (Z4).
 *
 * Todos os enums abaixo espelham (nunca importam) os tipos já definidos em
 * `src/lib/integrations/stone/*.ts` — mesma disciplina de independência de camada usada em todo o
 * projeto (`integrations/` nunca depende de `zezinho/`, e agora `db/schema/` nunca depende de
 * `integrations/`).
 *
 * Nenhum XML bruto é armazenado — só o hash (SHA-256) do arquivo comprimido recebido, suficiente
 * para auditoria e para detectar reprocessamento do mesmo conteúdo, sem guardar dado financeiro
 * bruto duplicado em texto no banco (seção 4 da decisão do usuário).
 */

export const stoneImportRunStatusEnum = pgEnum("stone_import_run_status", ["running", "succeeded", "failed"]);

export const stoneFileLayoutEnum = pgEnum("stone_file_layout", ["XML2_2", "XML2_4"]);

/** Mesmos 6 valores de `StoneResultStatus` (`types.ts`, Z1) — mirrorado, nunca importado. Só preenchido quando `status = "failed"`; usado por `healthStatus.ts` para distinguir erro de credencial de falha temporária sem depender de casamento de texto em `error_sanitized`. */
export const stoneResultStatusEnum = pgEnum("stone_result_status", ["ok", "not_configured", "temporary_failure", "stale_data", "insufficient_permission", "no_data"]);

export const stoneImportRuns = pgTable(
  "stone_import_runs",
  {
    id: id(),
    requestedPeriodFrom: date("requested_period_from"),
    requestedPeriodTo: date("requested_period_to"),
    referenceDate: date("reference_date").notNull(),
    layout: stoneFileLayoutEnum("layout").notNull(),
    /** SHA-256 do arquivo comprimido (.gz) recebido — nunca o conteúdo em si. */
    fileHash: text("file_hash"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: stoneImportRunStatusEnum("status").notNull().default("running"),
    recordCount: integer("record_count"),
    /** Nunca contém segredo, XML bruto nem dado sensível — só uma mensagem curta e sanitizada. */
    errorSanitized: text("error_sanitized"),
    failureStatus: stoneResultStatusEnum("failure_status"),
    origin: text("origin").notNull().default("manual"),
    ...timestamps,
  },
  (table) => [uniqueIndex("stone_import_runs_reference_date_layout_idx").on(table.referenceDate, table.layout)],
);

export const stoneTransactionEventTypeEnum = pgEnum("stone_transaction_event_type", ["sale", "cancellation", "chargeback", "chargeback_refund"]);

/** Mesmos 9 valores de `ReceivableState` (`receivableState.ts`) — mirrorado, nunca importado. */
export const stoneReceivableStateEnum = pgEnum("stone_receivable_state", [
  "scheduled",
  "due_today",
  "settled_on_time",
  "settled_early",
  "overdue",
  "cancelled",
  "reversed",
  "chargeback",
  "unknown",
]);

export const stoneNormalizedTransactions = pgTable(
  "stone_normalized_transactions",
  {
    id: id(),
    /** `buildTransactionExternalKey` (`identity.ts`, Z2) — SHA-256 determinístico por parcela. */
    externalKey: text("external_key").notNull().unique(),
    acquirerTransactionKey: text("acquirer_transaction_key").notNull(),
    authorizationCode: text("authorization_code").notNull(),
    initiatorTransactionKey: text("initiator_transaction_key"),
    establishmentCode: text("establishment_code").notNull(),
    terminalSerialNumber: text("terminal_serial_number"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    installmentNumber: integer("installment_number").notNull(),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 14, scale: 2 }).notNull(),
    netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: text("payment_method"),
    brandId: text("brand_id"),
    eventType: stoneTransactionEventTypeEnum("event_type").notNull(),
    receivableState: stoneReceivableStateEnum("receivable_state").notNull(),
    expectedPaymentDate: date("expected_payment_date"),
    settledPaymentDate: date("settled_payment_date"),
    settledAmount: numeric("settled_amount", { precision: 14, scale: 2 }),
    sourceFile: text("source_file").notNull(),
    importRunId: uuid("import_run_id").references(() => stoneImportRuns.id),
    ...timestamps,
  },
);

/** Mesmos 12 valores de `ReconciliationMatchType` (`jumpparkReconciliation.ts`) — mirrorado. */
export const stoneMatchTypeEnum = pgEnum("stone_match_type", [
  "exact_match",
  "probable_match",
  "ambiguous",
  "unmatched_jumppark",
  "unmatched_stone",
  "value_mismatch",
  "payment_method_mismatch",
  "installment_mismatch",
  "date_mismatch",
  "duplicate",
  "reversed",
  "pending_processing",
]);

/** Mesmos 3 valores de `MatchConfidenceLevel` — mirrorado. Qualitativa, nunca uma probabilidade. */
export const stoneMatchConfidenceEnum = pgEnum("stone_match_confidence", ["high", "medium", "low"]);

/**
 * Fluxo de revisão humana (Z4, decisão do usuário, seção 9). Usado tanto por
 * `stone_reconciliation_results.review_status` quanto por `stone_divergences.status` — mesmo
 * vocabulário, mesma semântica de revisão. Uma divergência recém-derivada nasce sempre `open`
 * (equivalente ao `status: "identificado"` da camada pura do Z3 — nunca pula direto para um
 * estado resolvido).
 */
export const stoneReviewStatusEnum = pgEnum("stone_review_status", ["open", "under_review", "confirmed_issue", "resolved", "ignored", "pending_processing"]);

export const stoneReconciliationResults = pgTable(
  "stone_reconciliation_results",
  {
    id: id(),
    /**
     * Chave natural determinística montada em código (nunca só `matchType` — colidiria entre
     * pares diferentes): `matchType:stoneKey:jumpparkId[:desambiguador]`. Garante upsert seguro
     * sem depender de unicidade multi-coluna com `NULL` (Postgres trata `NULL` como sempre
     * distinto em índices únicos, o que quebraria a idempotência para `unmatched_*`).
     */
    naturalKey: text("natural_key").notNull().unique(),
    stoneSaleExternalKey: text("stone_sale_external_key"),
    jumpparkOrderExternalId: text("jumppark_order_external_id"),
    matchType: stoneMatchTypeEnum("match_type").notNull(),
    confidence: stoneMatchConfidenceEnum("confidence").notNull(),
    /** Só para ordenação interna durante o matching — nunca uma probabilidade (seção 9.3, Z3). */
    heuristicScore: integer("heuristic_score"),
    favorableSignals: jsonb("favorable_signals").notNull().$type<string[]>(),
    contrarySignals: jsonb("contrary_signals").notNull().$type<string[]>(),
    ruleApplied: text("rule_applied").notNull(),
    reviewStatus: stoneReviewStatusEnum("review_status").notNull().default("open"),
    periodFrom: date("period_from").notNull(),
    periodTo: date("period_to").notNull(),
    ...timestamps,
  },
);

/** Mesmos 11 valores de `DivergenceType` (`divergences.ts`) — mirrorado. */
export const stoneDivergenceTypeEnum = pgEnum("stone_divergence_type", [
  "venda_jumppark_nao_encontrada_na_stone",
  "transacao_stone_nao_encontrada_no_jumppark",
  "diferenca_de_valor",
  "diferenca_forma_pagamento",
  "diferenca_parcelamento",
  "possivel_duplicidade",
  "cancelamento_nao_refletido_internamente",
  "estorno",
  "chargeback",
  "correspondencia_ambigua",
  "arquivo_stone_ausente_ou_defasado",
]);

/** Mesmos 3 valores de `DivergencePriority` — mirrorado. */
export const stoneDivergencePriorityEnum = pgEnum("stone_divergence_priority", ["alta", "media", "baixa"]);

export const stoneDivergences = pgTable(
  "stone_divergences",
  {
    id: id(),
    /** `type:stoneKey:jumpparkId[:referenceDate]` — mesma razão de `naturalKey` acima. */
    naturalKey: text("natural_key").notNull().unique(),
    type: stoneDivergenceTypeEnum("type").notNull(),
    priority: stoneDivergencePriorityEnum("priority").notNull(),
    financialImpact: numeric("financial_impact", { precision: 14, scale: 2 }).notNull(),
    evidence: jsonb("evidence").notNull().$type<string[]>(),
    involvedStoneSaleExternalKey: text("involved_stone_sale_external_key"),
    involvedJumpparkOrderExternalId: text("involved_jumppark_order_external_id"),
    confidence: stoneMatchConfidenceEnum("confidence").notNull(),
    recommendation: text("recommendation").notNull(),
    status: stoneReviewStatusEnum("status").notNull().default("open"),
    /** Preenchido só por ação explícita do usuário — nunca atribuído automaticamente. */
    assignee: text("assignee"),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    periodFrom: date("period_from").notNull(),
    periodTo: date("period_to").notNull(),
    ...timestamps,
  },
);
