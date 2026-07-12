import { boolean, date, integer, numeric, pgEnum, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  /** Slug estável (ex.: "don-juan-valor-550"), único, para seed idempotente. */
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
  /** Slug estável (ex.: "beneficio-funeraria-6-lavacoes"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
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
 * reversed: recebimento estornado — status manual, nunca recalculado automaticamente (módulo
 *   Contas a Receber, 10/07/2026). Adicionado ao enum existente via ALTER TYPE ... ADD VALUE,
 *   sem alterar nenhum valor já em uso.
 */
export const accountsReceivableStatusEnum = pgEnum("accounts_receivable_status", [
  "draft",
  "open",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "reversed",
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
  /** Centro de custo da receita (Estética Automotiva, Estacionamento, Administrativo). Reaproveita cost_centers. */
  costCenterId: uuid("cost_center_id").references(() => costCenters.id),
  /** Categoria de receita (Lavação, Polimento, Faróis, etc.). Reaproveita financial_categories. */
  categoryId: uuid("category_id").references(() => financialCategories.id),
  /** Conta onde o valor é esperado/foi recebido (Stone, Ailos). Reaproveita financial_accounts. */
  financialAccountId: uuid("financial_account_id").references(() => financialAccounts.id),
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
  /** Agrupa parcelas da mesma receita (ex.: 4x Stone). Mesmo padrão de accounts_payable. */
  installmentGroupId: uuid("installment_group_id"),
  installmentNumber: integer("installment_number"),
  installmentTotal: integer("installment_total"),
  /** Taxa cobrada no recebimento (ex.: taxa Stone da parcela). Null até a baixa acontecer. */
  feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }),
  /** receivedAmount - feeAmount desta baixa. Null até haver recebimento com taxa informada. */
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }),
  /** Texto livre — sem sessão de usuário real ainda, mesmo padrão de inventory_movements.responsible. */
  responsibleName: text("responsible_name"),
  approverName: text("approver_name"),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "iesa-recebivel-2026-06"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Baixa/pagamento efetivo. Serve tanto a accounts_receivable (recebimento) quanto a
 * accounts_payable (pagamento) — exatamente um dos dois deve ser preenchido por linha. Reused
 * em vez de criar uma tabela `accounts_payable_payments` separada.
 */
export const payments = pgTable("payments", {
  id: id(),
  accountsReceivableId: uuid("accounts_receivable_id").references(() => accountsReceivable.id),
  accountsPayableId: uuid("accounts_payable_id").references(() => accountsPayable.id),
  /** Conta/caixa de onde saiu (pagamento) ou para onde entrou (recebimento) o dinheiro. */
  financialAccountId: uuid("financial_account_id").references(() => financialAccounts.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidAt: date("paid_at"),
  /** "desconhecido" é um valor válido e esperado — nunca inventar a forma de pagamento. */
  method: paymentMethodEnum("method").notNull().default("desconhecido"),
  /** Taxa cobrada nesta baixa (ex.: taxa Stone de um recebimento). Null quando não informada. */
  feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }),
  /** amount - feeAmount desta baixa. Null quando não informada. Usado hoje só por Contas a Receber. */
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }),
  invoiceIssued: boolean("invoice_issued").notNull().default(false),
  /** Estorno: quando true, esta baixa foi revertida e não deve mais contar no saldo. */
  reversed: boolean("reversed").notNull().default(false),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
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

/** Contas bancárias/de pagamento e caixas reais da empresa (Parte 2 do módulo Contas a Pagar). */
export const financialAccountTypeEnum = pgEnum("financial_account_type", [
  "conta_pagamento",
  "conta_bancaria",
  "dinheiro",
]);

export const financialAccounts = pgTable("financial_accounts", {
  id: id(),
  name: text("name").notNull(),
  type: financialAccountTypeEnum("type").notNull(),
  /**
   * Fundo fixo desejado (só relevante para contas do tipo "dinheiro", ex.: caixa físico R$
   * 100,00) — também usado como limiar de alerta de saldo baixo. Nunca representa o saldo
   * atual: o saldo é sempre calculado a partir de cash_movements/account_transfers reais
   * vinculados a esta conta (ver src/lib/finance/status.ts, computeAccountBalance).
   */
  fixedFundAmount: numeric("fixed_fund_amount", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "conta-stone"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["entrada", "saida"]);

/**
 * Movimento de caixa real (dinheiro que efetivamente entrou/saiu numa data), distinto de
 * `accounts_receivable`/`accounts_payable` (o que é devido) e de `financialCategories`/receita
 * operacional (quando o serviço foi prestado). Um recebimento de conta a receber ou o pagamento
 * de uma conta a pagar gera uma linha aqui — é assim que o caso da IESA (recebido em 10/07/2026,
 * competência de junho) fica correto: aparece como caixa no dia 10/07, mas a conta a receber
 * mantém a competência de junho. Transferências entre contas (`account_transfers`) NÃO passam
 * por aqui — nunca entram como entrada/saída de receita/despesa.
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
  /** Conta/caixa onde o dinheiro efetivamente entrou/saiu. Null para movimentos legados sem conta informada. */
  financialAccountId: uuid("financial_account_id").references(() => financialAccounts.id),
  /** Baixa (payments) que gerou este movimento, quando aplicável — permite estornar com precisão. */
  paymentId: uuid("payment_id").references((): AnyPgColumn => payments.id),
  active: active(),
  source: source(),
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const accountTransferTypeEnum = pgEnum("account_transfer_type", ["transferencia", "reposicao_caixa"]);

/**
 * Transferências entre contas (Stone ↔ Ailos ↔ Caixa) e reposições de fundo de caixa. Nunca
 * entram como receita ou despesa — por isso ficam numa tabela própria, fora de cash_movements/
 * accounts_payable/accounts_receivable, e o cálculo de saldo de cada conta soma estas linhas
 * separadamente (ver computeAccountBalance).
 */
export const accountTransfers = pgTable("account_transfers", {
  id: id(),
  type: accountTransferTypeEnum("type").notNull(),
  /** Null = aporte externo (dinheiro entrando no sistema de contas pela primeira vez). */
  fromAccountId: uuid("from_account_id").references(() => financialAccounts.id),
  /** Null = saída do sistema de contas (ex.: retirada). */
  toAccountId: uuid("to_account_id").references(() => financialAccounts.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  description: text("description").notNull(),
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

/** Fornecedores (Parte 4 do módulo Contas a Pagar). Nunca inventar CNPJ/telefone/e-mail/endereço. */
export const suppliers = pgTable("suppliers", {
  id: id(),
  name: text("name").notNull(),
  /** Pessoa de contato, quando informada (ex.: representante de um fornecedor PJ/PF). */
  contactName: text("contact_name"),
  /** CNPJ ou CPF, só quando informado explicitamente — nunca inventado. */
  taxId: text("tax_id"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  active: active(),
  source: source(),
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Modelo de recorrência (Parte 5). Não gera accounts_payable automaticamente — é só a regra
 * (fornecedor, valor-base, categoria, centro de custo, vencimento, periodicidade). Gerar a
 * cobrança de um mês específico é uma ação explícita (ver
 * src/lib/finance/service.ts, generateAccountsPayableFromTemplate), nunca automática silenciosa.
 */
export const recurringBillTemplates = pgTable("recurring_bill_templates", {
  id: id(),
  description: text("description").notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  categoryId: uuid("category_id").references(() => financialCategories.id),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id),
  financialAccountId: uuid("financial_account_id").references(() => financialAccounts.id),
  /** Null quando o valor é variável por competência (ex.: água, energia) — nunca repetir o último valor como fixo. */
  amount: numeric("amount", { precision: 12, scale: 2 }),
  variableAmount: boolean("variable_amount").notNull().default(false),
  /** Dia do vencimento. Null quando não informado (ex.: água/energia, sem dia fixo definido). */
  dueDay: integer("due_day"),
  periodicity: text("periodicity").notNull().default("mensal"),
  /** Credor/valor ainda não confirmado pelo proprietário — nunca inventado, sinalizado aqui. */
  pendingData: boolean("pending_data").notNull().default(false),
  active: active(),
  source: source(),
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * rascunho: criada mas ainda não confirmada.
 * pendente: em aberto, dentro do prazo.
 * parcialmente_paga: recebeu alguma baixa, mas outstandingAmount > 0.
 * paga: outstandingAmount = 0.
 * vencida: em aberto (ou parcial) e dueDate já passou — sempre calculada, nunca gravada "presa".
 * cancelada: cancelada, não entra em nenhum total.
 */
export const accountsPayableStatusEnum = pgEnum("accounts_payable_status", [
  "rascunho",
  "pendente",
  "parcialmente_paga",
  "paga",
  "vencida",
  "cancelada",
]);

/**
 * Entidade central do módulo Contas a Pagar. Espelha a estrutura de accounts_receivable
 * (mesmo padrão de saldo/status), mas com vocabulário em português conforme especificado para
 * este módulo, e campos próprios (fornecedor, parcelamento, recorrência, dados pendentes).
 */
export const accountsPayable = pgTable("accounts_payable", {
  id: id(),
  description: text("description").notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => financialCategories.id),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id),
  /** Conta/caixa de onde o pagamento sai (ou saiu). Null enquanto não decidido. */
  financialAccountId: uuid("financial_account_id").references(() => financialAccounts.id),
  competenceDate: date("competence_date").notNull(),
  issueDate: date("issue_date"),
  dueDate: date("due_date").notNull(),
  originalAmount: numeric("original_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  /** Mantido em sincronia com originalAmount - paidAmount pela camada de aplicação. */
  outstandingAmount: numeric("outstanding_amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("desconhecido"),
  documentNumber: text("document_number"),
  status: accountsPayableStatusEnum("status").notNull().default("pendente"),
  /** Sinaliza cadastro com informação real faltando (ex.: credor não informado) — nunca inventada. */
  pendingData: boolean("pending_data").notNull().default(false),
  recurringBillTemplateId: uuid("recurring_bill_template_id").references(() => recurringBillTemplates.id),
  /** Agrupa parcelas da mesma compra/obrigação. Null quando não é uma compra parcelada. */
  installmentGroupId: uuid("installment_group_id"),
  installmentNumber: integer("installment_number"),
  installmentTotal: integer("installment_total"),
  /** Preparado para anexos futuros (ex.: nota fiscal digitalizada) — upload não implementado ainda. */
  attachmentRef: text("attachment_ref"),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "aluguel-2026-07"), único, para geração idempotente a partir de recorrência. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});
