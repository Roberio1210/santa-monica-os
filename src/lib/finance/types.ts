/**
 * Espelha exatamente src/db/schema/finance.ts (accountsReceivable). Qualquer mudança no schema
 * do banco deve ser replicada aqui e vice-versa.
 */
export type AccountsReceivableStatus = "draft" | "open" | "partially_paid" | "paid" | "overdue" | "cancelled";

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
  description: string;
  /** Mês/data de competência — a que período o valor se refere. Nunca a data de recebimento. */
  competenceDate: string;
  issueDate: string | null;
  dueDate: string;
  expectedAmount: number;
  receivedAmount: number;
  /** Sempre expectedAmount - receivedAmount, mantido em sincronia por status.ts. */
  outstandingAmount: number;
  /** Status armazenado (fonte da verdade para draft/cancelled — os demais podem ser recalculados). */
  status: AccountsReceivableStatus;
  paymentMethod: FinancePaymentMethod;
  invoiceNumber: string | null;
  invoiceIssued: boolean;
  receivedAt: string | null;
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
