import { boolean, date, integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { customers } from "./crm";

export const partnerTypeEnum = pgEnum("partner_type", [
  "parceria_pos_paga",
  "contrato_mensal",
  "outro",
]);

export const partners = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  type: partnerTypeEnum("type").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "iesa-nissan") — único, para seed idempotente (src/db/seed/contracts.ts). */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const contractStatusEnum = pgEnum("contract_status", ["ativo", "suspenso", "encerrado"]);
export const contractTypeEnum = pgEnum("contract_type", ["parceria_pos_paga", "mensalidade"]);

export const contracts = pgTable("contracts", {
  id: id(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id),
  title: text("title").notNull(),
  type: contractTypeEnum("type").notNull(),
  status: contractStatusEnum("status").notNull().default("ativo"),
  /** Null quando a data de início real não foi informada — nunca inferida. */
  startDate: date("start_date"),
  endDate: date("end_date"),
  /** Dia do mês em que o período fecha (ex.: IESA fecha no dia 1). Null se não aplicável. */
  billingClosingDay: integer("billing_closing_day"),
  /** Dia do mês em que o pagamento vence (ex.: IESA até dia 10, funerária dia 10, Don Juan dia 15). */
  dueDay: integer("due_day"),
  /** Valor base do contrato quando fixo (ex.: funerária R$ 1.000). Null quando variável. */
  baseValue: numeric("base_value", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "contrato-iesa-nissan-lavacao") — único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Vigências de valor de um contrato ao longo do tempo (ex.: Don Juan — R$ 550,00 até
 * 15/07/2026, R$ 800,00 a partir de 15/08/2026). Um contrato com valor fixo e nunca reajustado
 * pode não ter nenhuma linha aqui (o valor fica só em contracts.baseValue). Nenhuma linha aqui
 * gera cobrança automaticamente — é só a regra de vigência.
 */
export const contractValuePeriods = pgTable("contract_value_periods", {
  id: id(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** Data em que este valor passa a valer (inclusive). Null quando não informada — nunca inferida. */
  effectiveFrom: date("effective_from"),
  /** Data em que este valor deixa de valer (exclusive). Null = ainda vigente. */
  effectiveUntil: date("effective_until"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

export const contractBenefits = pgTable("contract_benefits", {
  id: id(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  description: text("description").notNull(),
  quantityPerPeriod: integer("quantity_per_period"),
  periodType: text("period_type").notNull().default("mensal"),
  /** Ex.: funerária tem 6 lavações/mês, não cumulativas — false aqui. */
  cumulative: boolean("cumulative").notNull().default(false),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * draft: criada mas ainda não confirmada/lançada oficialmente.
 * open: em aberto, dentro do prazo.
 * partially_paid: recebeu algum valor, mas outstandingAmount > 0.
 * paid: outstandingAmount = 0.
 * overdue: em aberto (ou parcial) e dueDate já passou.
 * cancelled: cancelada, não entra em nenhum total.
 */
export const accountsReceivableStatusEnum = pgEnum("accounts_receivable_status", [
  "draft",
  "open",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method_extended", [
  "dinheiro",
  "debito",
  "credito",
  "pix",
  "boleto",
  "transferencia",
  "outro",
  "desconhecido",
]);

/**
 * Entidade central do módulo Financeiro (Parte 2 da execução de 10/07/2026). Representa o que é
 * devido — nunca confundir com `cash_movements` (entrada de caixa efetiva). Uma conta a receber
 * pode ter `receivedAmount` parcial (`status = 'partially_paid'`) — o recebimento em si é
 * registrado em `payments` e refletido aqui via `receivedAmount`/`outstandingAmount`.
 */
export const accountsReceivable = pgTable("accounts_receivable", {
  id: id(),
  customerId: uuid("customer_id").references(() => customers.id),
  partnerId: uuid("partner_id").references(() => partners.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  description: text("description").notNull(),
  /** Mês/data de competência (a que período o valor se refere) — nunca a data de recebimento. */
  competenceDate: date("competence_date").notNull(),
  /** Data de emissão da cobrança/fatura. Null quando não informada. */
  issueDate: date("issue_date"),
  dueDate: date("due_date").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }).notNull(),
  receivedAmount: numeric("received_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  /** Mantido em sincronia com expectedAmount - receivedAmount pela camada de aplicação (src/lib/finance). */
  outstandingAmount: numeric("outstanding_amount", { precision: 12, scale: 2 }).notNull(),
  status: accountsReceivableStatusEnum("status").notNull().default("open"),
  /** "desconhecido" é um valor válido e esperado — nunca inventar a forma de pagamento. */
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("desconhecido"),
  /** Número da nota fiscal. Null quando não informado — nunca inventado. */
  invoiceNumber: text("invoice_number"),
  invoiceIssued: boolean("invoice_issued").notNull().default(false),
  /** Data efetiva do recebimento (pode ser diferente de dueDate). Null enquanto não recebido. */
  receivedAt: date("received_at"),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "iesa-recebivel-2026-06"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const payments = pgTable("payments", {
  id: id(),
  accountsReceivableId: uuid("accounts_receivable_id").references(() => accountsReceivable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidAt: date("paid_at"),
  /** "desconhecido" é um valor válido e esperado — nunca inventar a forma de pagamento. */
  method: paymentMethodEnum("method").notNull().default("desconhecido"),
  invoiceIssued: boolean("invoice_issued").notNull().default(false),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "iesa-pagamento-2026-07-10"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const invoices = pgTable("invoices", {
  id: id(),
  accountsReceivableId: uuid("accounts_receivable_id").references(() => accountsReceivable.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  number: text("number"),
  issuedAt: date("issued_at"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  /** Slug estável, único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/** RECEITAS/DESPESAS do plano de contas (Parte 6). Estrutura apenas — nenhum valor lançado aqui. */
export const financialCategoryTypeEnum = pgEnum("financial_category_type", ["receita", "despesa"]);

export const financialCategories = pgTable("financial_categories", {
  id: id(),
  name: text("name").notNull(),
  type: financialCategoryTypeEnum("type").notNull(),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "receita-estacionamento"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const costCenters = pgTable("cost_centers", {
  id: id(),
  name: text("name").notNull(),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "cc-estacionamento"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["entrada", "saida"]);

/**
 * Movimento de caixa real (dinheiro que efetivamente entrou/saiu numa data), distinto de
 * `accounts_receivable` (o que é devido) e de `financialCategories`/receita operacional (quando
 * o serviço foi prestado). Um recebimento de conta a receber gera uma linha aqui, apontando de
 * volta para a conta via `accountsReceivableId` — é assim que o caso da IESA (recebido em
 * 10/07/2026, competência de junho) fica correto: aparece como caixa no dia 10/07, mas a conta
 * a receber mantém a competência de junho.
 */
export const cashMovements = pgTable("cash_movements", {
  id: id(),
  date: date("date").notNull(),
  type: cashMovementTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  accountsReceivableId: uuid("accounts_receivable_id").references(() => accountsReceivable.id),
  categoryId: uuid("category_id").references(() => financialCategories.id),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id),
  active: active(),
  source: source(),
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const reconciliationMatchStatusEnum = pgEnum("reconciliation_match_status", [
  "matched",
  "unmatched",
  "partial",
]);

/**
 * Preparado para conciliação futura (ex.: extrato Stone/banco x cash_movements). Nenhuma
 * integração de conciliação real foi implementada nesta execução — só o modelo.
 */
export const reconciliationRecords = pgTable("reconciliation_records", {
  id: id(),
  cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id),
  /** Referência do lado externo (ex.: id da transação na Stone). Null até haver integração real. */
  externalReference: text("external_reference"),
  matchedAmount: numeric("matched_amount", { precision: 12, scale: 2 }),
  matchStatus: reconciliationMatchStatusEnum("match_status").notNull().default("unmatched"),
  reconciledAt: date("reconciled_at"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
