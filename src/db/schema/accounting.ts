import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  /** Missão Financeiro V4.0 — dívida com terceiros/sócios que espera devolução (recebida ou devolvida), ex.: RF Base Participações. */
  "emprestimo",
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
 * em audit_logs (entityType="accounting_period"); esta tabela guarda só o estado atual. Os
 * NÚMEROS do fechamento (o que a DRE mostrava naquele momento) nunca ficaram aqui — ver
 * `dreSnapshots` (Missão Financeiro V7/Fase C7).
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

/**
 * Missão Financeiro V7 (Fase C7, 31/08/2026) — snapshot imutável do `DreReport` no momento de um
 * fechamento mensal. Motivação real: a auditoria da Fase B1 provou que `computeDreReport()` pode
 * retornar valores diferentes para a MESMA competência em dias diferentes, porque duas de suas
 * fontes (`jumppark_service_orders`, `stone_normalized_transactions`) são sincronizadas por um
 * cron externo mesmo para competências passadas — um "fechamento" que só muda `accounting_periods.
 * status` (como era antes desta missão) não protege nada contra essa deriva. Esta tabela congela
 * o `DreReport` inteiro (com toda a proveniência — cada `DreLineItem` já carrega `sourceId`/
 * `sourceKind`, então o payload não precisa duplicar o banco à parte) mais um hash de integridade,
 * no exato instante do fechamento.
 *
 * Nunca sobrescrita: reabrir uma competência marca a versão vigente `isOfficial=false` (nunca
 * apaga/edita `reportPayload`) e um novo fechamento cria uma linha nova com `version` seguinte —
 * histórico completo sempre consultável via `WHERE competence_month = ? ORDER BY version`.
 */
export const dreSnapshots = pgTable(
  "dre_snapshots",
  {
    id: id(),
    /** Formato "YYYY-MM" — mesmo valor de `accountingPeriods.competenceMonth`, mas não único sozinho: várias versões históricas podem existir por competência. */
    competenceMonth: text("competence_month").notNull(),
    /** 1, 2, 3... por competência — nunca reaproveitado, nunca decrementado. */
    version: integer("version").notNull(),
    /** true = fechamento vigente desta competência. No máximo UMA linha true por competenceMonth (garantido pelo índice único parcial abaixo, não só pela aplicação). */
    isOfficial: boolean("is_official").notNull().default(true),
    /** Regime usado no cálculo (sempre "gerencial" na prática, mas gravado explicitamente — nunca presumido). */
    regime: text("regime").notNull(),
    /** Momento em que o DreReport foi calculado — pode ser (e normalmente é) o mesmo instante de closedAt, mas gravado separado porque o cálculo e a gravação são passos logicamente distintos. */
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    computedBy: text("computed_by").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    closedBy: text("closed_by").notNull(),
    /** Preenchido quando esta versão deixa de ser oficial (reabertura ou substituição por versão seguinte) — nunca quando é criada. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    /** Aponta para a versão que tornou esta obsoleta, quando existir — permite navegar a cadeia de versões sem depender só do número sequencial. */
    supersededByVersionId: uuid("superseded_by_version_id").references((): AnyPgColumn => dreSnapshots.id),
    /**
     * Identifica a LÓGICA de cálculo usada (não os dados) — ex.: "C3" (após a correção do bug de
     * exclusão IESA em `corporatePartnerRevenue.ts`). Importante porque o motor pode mudar entre
     * dois fechamentos da mesma competência (reabertura + correção de bug + refechamento), e essa
     * mudança precisa ser rastreável separadamente da mudança nos DADOS.
     */
    methodologyVersion: text("methodology_version").notNull(),
    /** DreReport completo serializado (todos os grupos, todos os DreLineItem com sourceId/sourceKind — é a própria proveniência, nunca duplicada em outra tabela). */
    reportPayload: jsonb("report_payload").notNull(),
    /** sha256 do payload canonicalizado (ver `dreSnapshotHash.ts`) — prova que o JSON lido agora é bit-a-bit o que foi fechado, nunca editado depois. */
    payloadHash: text("payload_hash").notNull(),
    hashAlgorithm: text("hash_algorithm").notNull().default("sha256"),
    /** Cópia de `report.naoClassificados.length` no momento do fechamento — sempre 0 (fechar com pendência é bloqueado), mas gravado para auditoria futura mesmo assim. */
    pendingCount: integer("pending_count").notNull(),
    /** Soma de todos os DreLineItem de todos os grupos — contagem rápida para auditoria sem precisar abrir o JSON. */
    lineItemCount: integer("line_item_count").notNull(),
    accountingPeriodId: uuid("accounting_period_id").notNull().references(() => accountingPeriods.id),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("dre_snapshots_competence_version_idx").on(table.competenceMonth, table.version),
    uniqueIndex("dre_snapshots_official_per_competence_idx").on(table.competenceMonth).where(sql`${table.isOfficial} = true`),
  ],
);
