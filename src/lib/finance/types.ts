/**
 * Espelha exatamente src/db/schema/finance.ts (accountsReceivable). Qualquer mudança no schema
 * do banco deve ser replicada aqui e vice-versa.
 * "reversed" (estornado) é manual, como "draft"/"cancelled" — nunca recalculado automaticamente
 * (módulo Contas a Receber, adicionado via ALTER TYPE ADD VALUE, sem remover valores existentes).
 */
export type AccountsReceivableStatus = "draft" | "open" | "partially_paid" | "paid" | "overdue" | "cancelled" | "reversed";

export type FinancePaymentMethod =
  | "dinheiro"
  | "debito"
  | "credito"
  | "pix"
  | "boleto"
  | "transferencia"
  | "outro"
  | "desconhecido";

export interface AccountsReceivable {
  id: string;
  customerId: string | null;
  partnerId: string | null;
  contractId: string | null;
  /** Nome do cliente/parceiro para exibição, sem exigir join — preenchido pelo repositório. */
  partyName: string;
  /** Centro de custo da receita (Estética Automotiva, Estacionamento, Administrativo). */
  costCenterId: string | null;
  costCenterName: string | null;
  /** Categoria de receita (Lavação, Polimento, Faróis, etc.), do plano de contas já existente. */
  categoryId: string | null;
  categoryName: string | null;
  /** Conta onde o valor é esperado/foi recebido (Stone, Ailos). */
  financialAccountId: string | null;
  financialAccountName: string | null;
  description: string;
  /** Mês/data de competência — a que período o valor se refere. Nunca a data de recebimento. */
  competenceDate: string;
  issueDate: string | null;
  dueDate: string;
  expectedAmount: number;
  receivedAmount: number;
  /** Sempre expectedAmount - receivedAmount, mantido em sincronia por status.ts. */
  outstandingAmount: number;
  /** Status armazenado (fonte da verdade para draft/cancelled/reversed — os demais podem ser recalculados). */
  status: AccountsReceivableStatus;
  paymentMethod: FinancePaymentMethod;
  invoiceNumber: string | null;
  invoiceIssued: boolean;
  receivedAt: string | null;
  /** Agrupa parcelas da mesma receita (ex.: 4x Stone). Null quando não é parcelado. */
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** Taxa cobrada no recebimento (ex.: taxa Stone). Null até haver baixa com taxa informada. */
  feeAmount: number | null;
  /** receivedAmount - feeAmount acumulado das baixas. Null até haver recebimento. */
  netAmount: number | null;
  /** Texto livre — sem sessão de usuário real ainda (mesmo padrão de inventory_movements.responsible). */
  responsibleName: string | null;
  approverName: string | null;
  source: string;
  externalId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsReceivableView extends AccountsReceivable {
  /** Status recalculado a partir de outstandingAmount/dueDate (ver src/lib/finance/status.ts). */
  computedStatus: AccountsReceivableStatus;
  isOverdue: boolean;
}

export interface RecordPaymentInput {
  accountsReceivableId: string;
  amount: number;
  paidAt: string;
  method: FinancePaymentMethod;
  notes?: string | null;
}

export interface CreateAccountsReceivableInput {
  description: string;
  customerId?: string | null;
  partnerId?: string | null;
  contractId?: string | null;
  costCenterId?: string | null;
  categoryId?: string | null;
  financialAccountId?: string | null;
  competenceDate: string;
  issueDate?: string | null;
  dueDate: string;
  expectedAmount: number;
  paymentMethod?: FinancePaymentMethod;
  invoiceNumber?: string | null;
  invoiceIssued?: boolean;
  notes?: string | null;
  status?: AccountsReceivableStatus;
  responsibleName?: string | null;
  approverName?: string | null;
  /** Quando > 1, gera N parcelas de expectedAmount/installmentTotal, vencendo em meses seguintes. */
  installmentTotal?: number;
}

export interface UpdateAccountsReceivableInput {
  id: string;
  description?: string;
  customerId?: string | null;
  partnerId?: string | null;
  contractId?: string | null;
  costCenterId?: string | null;
  categoryId?: string | null;
  financialAccountId?: string | null;
  competenceDate?: string;
  issueDate?: string | null;
  dueDate?: string;
  expectedAmount?: number;
  paymentMethod?: FinancePaymentMethod;
  invoiceNumber?: string | null;
  invoiceIssued?: boolean;
  notes?: string | null;
  responsibleName?: string | null;
  approverName?: string | null;
}

export interface ReceivableSettlement {
  id: string;
  accountsReceivableId: string;
  amount: number;
  paidAt: string | null;
  method: FinancePaymentMethod;
  financialAccountId: string | null;
  /** Taxa descontada nesta baixa específica (ex.: taxa Stone). Null quando não informada. */
  feeAmount: number | null;
  /** amount - feeAmount desta baixa. Igual a amount quando feeAmount é null. */
  netAmount: number | null;
  reversed: boolean;
  reversedAt: string | null;
  notes: string | null;
}

export interface RecordReceivablePaymentInput {
  accountsReceivableId: string;
  amount: number;
  paidAt: string;
  method: FinancePaymentMethod;
  financialAccountId?: string | null;
  /** Taxa cobrada nesta baixa (ex.: taxa Stone). Nunca inventada — só quando realmente informada. */
  feeAmount?: number | null;
  notes?: string | null;
  /** Sem isto, receber mais que outstandingAmount lança ReceivableOverpaymentError. */
  allowOverpayment?: boolean;
}

export type CashMovementType = "entrada" | "saida";

export interface CashMovement {
  id: string;
  date: string;
  type: CashMovementType;
  amount: number;
  description: string;
  accountsReceivableId: string | null;
  categoryId: string | null;
  costCenterId: string | null;
  financialAccountId: string | null;
  paymentId: string | null;
  source: string;
  externalId: string | null;
  notes: string | null;
}

export type ContractType = "parceria_pos_paga" | "mensalidade";
export type ContractStatus = "ativo" | "suspenso" | "encerrado";

export interface Partner {
  id: string;
  name: string;
  type: "parceria_pos_paga" | "contrato_mensal" | "outro";
}

export interface ContractValuePeriod {
  id: string;
  contractId: string;
  amount: number;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  notes: string | null;
}

export interface ContractBenefit {
  id: string;
  contractId: string;
  description: string;
  quantityPerPeriod: number | null;
  periodType: string;
  cumulative: boolean;
}

// --- Fundação (plano de contas) ---

export type FinancialCategoryType = "receita" | "despesa";

export interface FinancialCategory {
  id: string;
  name: string;
  type: FinancialCategoryType;
}

export interface CostCenter {
  id: string;
  name: string;
}

// --- Contas a Pagar ---

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export type FinancialAccountType = "conta_pagamento" | "conta_bancaria" | "dinheiro";

export interface FinancialAccount {
  id: string;
  name: string;
  type: FinancialAccountType;
  /** Fundo fixo desejado (só relevante para "dinheiro") e limiar de alerta de saldo baixo. */
  fixedFundAmount: number | null;
  notes: string | null;
}

export interface FinancialAccountBalance extends FinancialAccount {
  /** Sempre calculado a partir de cash_movements + account_transfers reais — nunca um valor gravado à parte. */
  currentBalance: number;
  belowThreshold: boolean;
}

export type AccountTransferType = "transferencia" | "reposicao_caixa";

export interface AccountTransfer {
  id: string;
  type: AccountTransferType;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  date: string;
  description: string;
  notes: string | null;
}

export interface RecordAccountTransferInput {
  type: AccountTransferType;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  amount: number;
  date: string;
  description: string;
  notes?: string | null;
}

export interface RecurringBillTemplate {
  id: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string | null;
  costCenterId: string | null;
  financialAccountId: string | null;
  amount: number | null;
  variableAmount: boolean;
  dueDay: number | null;
  periodicity: string;
  pendingData: boolean;
  notes: string | null;
}

export type AccountsPayableStatus = "rascunho" | "pendente" | "parcialmente_paga" | "paga" | "vencida" | "cancelada";

export interface AccountsPayable {
  id: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string;
  categoryName: string;
  costCenterId: string | null;
  costCenterName: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  competenceDate: string;
  issueDate: string | null;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  /** Sempre originalAmount - paidAmount, mantido em sincronia por status.ts. */
  outstandingAmount: number;
  paymentMethod: FinancePaymentMethod;
  documentNumber: string | null;
  /** Status armazenado (fonte da verdade para rascunho/cancelada — os demais podem ser recalculados). */
  status: AccountsPayableStatus;
  pendingData: boolean;
  recurringBillTemplateId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  attachmentRef: string | null;
  source: string;
  externalId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsPayableView extends AccountsPayable {
  computedStatus: AccountsPayableStatus;
  isOverdue: boolean;
}

export interface CreateAccountsPayableInput {
  description: string;
  supplierId?: string | null;
  categoryId: string;
  costCenterId?: string | null;
  financialAccountId?: string | null;
  competenceDate: string;
  issueDate?: string | null;
  dueDate: string;
  originalAmount: number;
  paymentMethod?: FinancePaymentMethod;
  documentNumber?: string | null;
  notes?: string | null;
  status?: AccountsPayableStatus;
  pendingData?: boolean;
  /** Quando > 1, gera N parcelas de originalAmount/installmentTotal, vencendo em meses seguintes. */
  installmentTotal?: number;
  /** Preenchido só quando a conta vem de generateAccountsPayableFromTemplate — nunca pela UI. */
  recurringBillTemplateId?: string | null;
}

export interface UpdateAccountsPayableInput {
  id: string;
  description?: string;
  supplierId?: string | null;
  categoryId?: string;
  costCenterId?: string | null;
  financialAccountId?: string | null;
  competenceDate?: string;
  issueDate?: string | null;
  dueDate?: string;
  originalAmount?: number;
  paymentMethod?: FinancePaymentMethod;
  documentNumber?: string | null;
  notes?: string | null;
  pendingData?: boolean;
}

export interface PayableSettlement {
  id: string;
  accountsPayableId: string;
  amount: number;
  paidAt: string | null;
  method: FinancePaymentMethod;
  financialAccountId: string | null;
  reversed: boolean;
  reversedAt: string | null;
  notes: string | null;
}

export interface RecordPayablePaymentInput {
  accountsPayableId: string;
  amount: number;
  paidAt: string;
  method: FinancePaymentMethod;
  financialAccountId?: string | null;
  notes?: string | null;
  /** Sem isto, pagar mais que outstandingAmount lança PayableOverpaymentError. */
  allowOverpayment?: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}

export interface Contract {
  id: string;
  partnerId: string;
  partnerName: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  startDate: string | null;
  endDate: string | null;
  billingClosingDay: number | null;
  dueDay: number | null;
  baseValue: number | null;
  notes: string | null;
  valuePeriods: ContractValuePeriod[];
  benefits: ContractBenefit[];
}
