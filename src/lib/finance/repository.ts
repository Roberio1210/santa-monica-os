import type {
  AccountingPeriod,
  AccountsPayable,
  AccountsReceivable,
  AccountTransfer,
  AllocationRule,
  AuditLogEntry,
  CashMovement,
  ClassificationRule,
  ClassifyEntityInput,
  CloseAccountingPeriodInput,
  Contract,
  CostCenter,
  CreateAccountsPayableInput,
  CreateAccountsReceivableInput,
  CreateAllocationRuleInput,
  CreateCashMovementInput,
  CreateClassificationRuleInput,
  FinancialAccountBalance,
  FinancialCategory,
  FinancialCategoryType,
  FinancialClassification,
  InformAccountBalanceInput,
  Partner,
  PayableSettlement,
  ReceivableSettlement,
  RecordAccountTransferInput,
  RecordPaymentInput,
  RecordPayablePaymentInput,
  RecordReceivablePaymentInput,
  RecurringBillTemplate,
  ReopenAccountingPeriodInput,
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

  // --- Fluxo de Caixa ---
  /** Lançamento manual (entrada/saída/ajuste/estorno/taxa/tarifa/juros) — gera balanceBefore/After. */
  createCashMovement(input: CreateCashMovementInput): Promise<CashMovement>;
  /** Grava o saldo conferido manualmente pelo usuário, para o alerta de divergência. */
  informAccountBalance(input: InformAccountBalanceInput): Promise<FinancialAccountBalance>;
  listAccountTransfers(): Promise<AccountTransfer[]>;

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

  // --- Contabilidade Gerencial ---
  listFinancialClassifications(): Promise<FinancialClassification[]>;
  /** Cria ou substitui a classificação vigente de um lançamento — histórico vai para audit_logs. */
  classifyEntity(input: ClassifyEntityInput): Promise<FinancialClassification>;
  listClassificationRules(): Promise<ClassificationRule[]>;
  createClassificationRule(input: CreateClassificationRuleInput): Promise<ClassificationRule>;
  deleteClassificationRule(id: string): Promise<void>;
  listAllocationRules(): Promise<AllocationRule[]>;
  /** Lança erro se a soma dos percentuais dos shares não for exatamente 100. */
  createAllocationRule(input: CreateAllocationRuleInput): Promise<AllocationRule>;
  listAccountingPeriods(): Promise<AccountingPeriod[]>;
  getAccountingPeriod(competenceMonth: string): Promise<AccountingPeriod | null>;
  closeAccountingPeriod(input: CloseAccountingPeriodInput): Promise<AccountingPeriod>;
  reopenAccountingPeriod(input: ReopenAccountingPeriodInput): Promise<AccountingPeriod>;
}
