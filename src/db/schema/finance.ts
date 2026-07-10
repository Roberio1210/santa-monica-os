import { boolean, date, integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

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
  /** Valor base do contrato quando fixo (ex.: funerária R$ 1.000, Don Juan R$ 550/R$ 800). Null quando variável. */
  baseValue: numeric("base_value", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "contrato-iesa-nissan-lavacao") — único, para seed idempotente. */
  externalId: text("external_id").unique(),
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

export const receivableStatusEnum = pgEnum("receivable_status", [
  "pendente",
  "pago",
  "atrasado",
  "desconhecido",
]);

export const receivables = pgTable("receivables", {
  id: id(),
  contractId: uuid("contract_id").references(() => contracts.id),
  partnerId: uuid("partner_id").references(() => partners.id),
  /** Mês de competência (ex.: 2026-06-01 representa junho/2026), não a data de recebimento. */
  referenceMonth: date("reference_month").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  status: receivableStatusEnum("status").notNull().default("pendente"),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "iesa-recebivel-2026-06"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

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

export const payments = pgTable("payments", {
  id: id(),
  receivableId: uuid("receivable_id").references(() => receivables.id),
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
  receivableId: uuid("receivable_id").references(() => receivables.id),
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
