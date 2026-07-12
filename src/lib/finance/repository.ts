import type {
  AccountsPayable,
  AccountsReceivable,
  AccountTransfer,
  AuditLogEntry,
  CashMovement,
  Contract,
  CostCenter,
  CreateAccountsPayableInput,
  CreateAccountsReceivableInput,
  FinancialAccountBalance,
  FinancialCategory,
  FinancialCategoryType,
  Partner,
  PayableSettlement,
  ReceivableSettlement,
  RecordAccountTransferInput,
  RecordPaymentInput,
  RecordPayablePaymentInput,
  RecordReceivablePaymentInput,
  RecurringBillTemplate,
  Supplier,
  UpdateAccountsPayableInput,
  UpdateAccountsReceivableInput,
} from "@/lib/finance/types";

/**
 * Contrato de acesso a dados financeiros, desacoplado da implementação — mesmo padrão de
 * src/lib/inventory/repository.ts. Uma futura implementação Postgres deve satisfazer esta
 * mesma interface sem exigir mudança nos componentes que a consomem.
 */
export interface FinanceRepository {
  listAccountsReceivable(): Promise<AccountsReceivable[]>;
  getAccountsReceivable(id: string): Promise<AccountsReceivable | null>;
  /**
   * Registra um recebimento (total ou parcial) e atualiza receivedAmount/outstandingAmount do
   * registro correspondente. Método legado, preservado por compatibilidade — não gera
   * `payments`/`cash_movements` (ver `recordReceivablePayment` para o fluxo completo com
   * histórico de baixas, usado pela UI do módulo Contas a Receber).
   */
  recordPayment(input: RecordPaymentInput): Promise<AccountsReceivable>;
  listCashMovements(): Promise<CashMovement[]>;
  listContracts(): Promise<Contract[]>;

  // --- Contas a Receber ---
  /** Retorna mais de um registro quando installmentTotal > 1 (parcelas vinculadas, ex.: 4x Stone). */
  createAccountsReceivable(input: CreateAccountsReceivableInput): Promise<AccountsReceivable[]>;
  updateAccountsReceivable(input: UpdateAccountsReceivableInput): Promise<AccountsReceivable>;
  /** Lança ReceivableOverpaymentError se amount > saldo e allowOverpayment não for true. */
  recordReceivablePayment(input: RecordReceivablePaymentInput): Promise<AccountsReceivable>;
  listReceivableSettlements(accountsReceivableId: string): Promise<ReceivableSettlement[]>;
  /** Marca a conta como "reversed" (estornado) — status manual, distinto de voltar a "open". */
  reverseReceivableSettlement(settlementId: string): Promise<AccountsReceivable>;
  cancelAccountsReceivable(id: string): Promise<AccountsReceivable>;
  /** Só permitido quando não há nenhuma baixa registrada — senão lança erro (preferir cancelar). */
  deleteAccountsReceivable(id: string): Promise<void>;
  /** Todos os clientes/parceiros cadastrados (inclusive os sem contrato, ex.: WeCharge). */
  listPartners(): Promise<Partner[]>;

  // --- Fundação (fornecedores, contas financeiras, recorrências, plano de contas) ---
  listSuppliers(): Promise<Supplier[]>;
  listFinancialCategories(type?: FinancialCategoryType): Promise<FinancialCategory[]>;
  listCostCenters(): Promise<CostCenter[]>;
  listFinancialAccounts(): Promise<FinancialAccountBalance[]>;
  recordAccountTransfer(input: RecordAccountTransferInput): Promise<AccountTransfer>;
  listRecurringBillTemplates(): Promise<RecurringBillTemplate[]>;

  // --- Contas a Pagar ---
  listAccountsPayable(): Promise<AccountsPayable[]>;
  getAccountsPayable(id: string): Promise<AccountsPayable | null>;
  /** Retorna mais de um registro quando installmentTotal > 1 (parcelas vinculadas). */
  createAccountsPayable(input: CreateAccountsPayableInput): Promise<AccountsPayable[]>;
  updateAccountsPayable(input: UpdateAccountsPayableInput): Promise<AccountsPayable>;
  /** Lança PayableOverpaymentError se amount > saldo e allowOverpayment não for true. */
  recordPayablePayment(input: RecordPayablePaymentInput): Promise<AccountsPayable>;
  listPayableSettlements(accountsPayableId: string): Promise<PayableSettlement[]>;
  /** Reverte uma baixa específica e restaura o saldo da conta a pagar correspondente. */
  reversePayableSettlement(settlementId: string): Promise<AccountsPayable>;
  cancelAccountsPayable(id: string): Promise<AccountsPayable>;
  /** Só permitido quando não há nenhuma baixa registrada — senão lança erro (preferir cancelar). */
  deleteAccountsPayable(id: string): Promise<void>;
  listAuditLog(entityType: string, entityId: string): Promise<AuditLogEntry[]>;
}
