import { date, integer, jsonb, numeric, pgEnum, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { active, id, notes, source, timestamps } from "./common";
import { financialAccounts, financialCategories, suppliers, partners, accountsReceivable, accountsPayable, cashMovements, accountTransfers } from "./finance";

/**
 * Missão Financeiro V2.1 — extrato bancário real (hoje só Stone, arquitetura genérica por conta
 * financeira). Não é `cash_movements`: é o retrato bruto e imutável de cada linha do extrato
 * (fonte da verdade da MOVIMENTAÇÃO DA CONTA, ver Fase H da missão) — vira `cash_movements`/
 * `account_transfers` só depois de uma decisão explícita (`processBankStatementLine`), nunca
 * automaticamente. Mesmo padrão em 2 fases de `purchase_imports`/`purchase_import_lines`
 * (Missão 23): prévia sempre grava tudo, confirmação é sempre por linha.
 */
export const bankStatementImportStatusEnum = pgEnum("bank_statement_import_status", ["previa", "processado"]);

export const bankStatementImports = pgTable("bank_statement_imports", {
  id: id(),
  financialAccountId: uuid("financial_account_id")
    .notNull()
    .references(() => financialAccounts.id),
  fileFormat: text("file_format").notNull(),
  filename: text("filename"),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  importedBy: text("imported_by").notNull(),
  status: bankStatementImportStatusEnum("status").notNull().default("previa"),
  rowCount: integer("row_count").notNull().default(0),
  newRowCount: integer("new_row_count").notNull().default(0),
  duplicateRowCount: integer("duplicate_row_count").notNull().default(0),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

export const bankStatementLineDirectionEnum = pgEnum("bank_statement_line_direction", ["entrada", "saida"]);

/**
 * Natureza inferida da linha (Fase B da missão) — nunca decide sozinha o que fazer com o
 * dinheiro; só orienta a triagem. `recebimento_venda_stone`/`antecipacao_credito` são os únicos
 * tipos elegíveis para conciliação automática contra `stone_normalized_transactions` — nunca
 * geram receita nova (a venda já existe via JumpPark/Stone adquirência), só confirmam a
 * liquidação. Os demais sempre exigem classificação humana explícita antes de virar um
 * `cash_movements`/`account_transfers` real.
 */
export const bankStatementLineTypeEnum = pgEnum("bank_statement_line_type", [
  "recebimento_venda_stone",
  "antecipacao_credito",
  "pix_recebido",
  "pix_enviado",
  "transferencia_entrada",
  "transferencia_saida",
  /** Pix/transferência recebida de sócio/empresa, CONFIRMADA pelo operador como aporte de capital (Fase B, caso 3) — nunca inferido automaticamente na importação. */
  "aporte",
  /** Retirada de sócio, CONFIRMADA pelo operador (Fase B, caso 3) — nunca inferido automaticamente na importação. */
  "retirada",
  "pagamento",
  "tarifa",
  "mensalidade_stone",
  "devolucao",
  "outro",
]);

/**
 * Estado de conciliação (Fase D da missão) — eixo independente da classificação DRE (essa
 * continua em `financial_classifications`/`classification_rules`, já existente, reaproveitado
 * sem alteração). NUNCA excluir uma linha real por não conseguir classificá-la — "ignorado" só
 * quando houver justificativa explícita gravada em `reconciliation_note`.
 */
export const bankStatementLineStatusEnum = pgEnum("bank_statement_line_status", [
  "conciliado",
  "sugerido",
  "nao_conciliado",
  "a_classificar",
  "ignorado",
]);

export const bankStatementLines = pgTable("bank_statement_lines", {
  id: id(),
  importId: uuid("import_id")
    .notNull()
    .references(() => bankStatementImports.id),
  rowIndex: integer("row_index").notNull(),
  /** Retrato exato da linha como veio do arquivo — nunca perdido, mesmo depois de processada. */
  rawData: jsonb("raw_data").notNull(),

  date: date("date").notNull(),
  description: text("description").notNull(),
  counterparty: text("counterparty"),
  direction: bankStatementLineDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: bankStatementLineTypeEnum("type").notNull(),
  status: bankStatementLineStatusEnum("status").notNull().default("nao_conciliado"),

  categoryId: uuid("category_id").references(() => financialCategories.id),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  partnerId: uuid("partner_id").references(() => partners.id),

  /** Preenchido só quando `type` é elegível a conciliação automática e a soma bateu/quase bateu — nunca cria recebível novo. */
  matchedStoneAmount: numeric("matched_stone_amount", { precision: 12, scale: 2 }),
  matchedStoneDivergence: numeric("matched_stone_divergence", { precision: 12, scale: 2 }),

  linkedAccountsReceivableId: uuid("linked_accounts_receivable_id").references((): AnyPgColumn => accountsReceivable.id),
  linkedAccountsPayableId: uuid("linked_accounts_payable_id").references((): AnyPgColumn => accountsPayable.id),
  /** Preenchido quando a linha vira um `cash_movements` real (`processBankStatementLine`). */
  linkedCashMovementId: uuid("linked_cash_movement_id").references((): AnyPgColumn => cashMovements.id),
  /** Preenchido quando a linha vira uma `account_transfers` real (transferência/aporte/retirada). */
  linkedAccountTransferId: uuid("linked_account_transfer_id").references((): AnyPgColumn => accountTransfers.id),

  reconciliationNote: text("reconciliation_note"),
  processedBy: text("processed_by"),

  /**
   * Determinístico: hash de (conta, data, direção, valor em centavos, descrição normalizada,
   * contraparte, índice de ocorrência entre linhas idênticas) — reimportar o mesmo extrato nunca
   * duplica; duas transferências genuinamente idênticas no mesmo dia continuam distintas.
   */
  dedupeKey: text("dedupe_key").notNull().unique(),

  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});
