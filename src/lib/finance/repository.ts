import type {
  AccountsPayable,
  AccountsReceivable,
  AccountTransfer,
  AuditLogEntry,
  CashMovement,
  Contract,
  CostCenter,
  CreateAccountsPayableInput,
  FinancialAccountBalance,
  FinancialCategory,
  FinancialCategoryType,
  PayableSettlement,
  RecordAccountTransferInput,
  RecordPaymentInput,
  RecordPayablePaymentInput,
  RecurringBillTemplate,
  Supplier,
  UpdateAccountsPayableInput,
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
   * registro correspondente. Não implementado na UI pública nesta fase (ver Parte 8 —
   * segurança: nenhuma ação de escrita fica exposta sem autenticação).
   */
  recordPayment(input: RecordPaymentInput): Promise<AccountsReceivable>;
  listCashMovements(): Promise<CashMovement[]>;
  listContracts(): Promise<Contract[]>;

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
