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
  CreateContractInput,
  CreatePartnerInput,
  CreateRecurringBillTemplateInput,
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
  /** Missão Financeiro V2 — busca idempotente por origem (ex.: conciliação Stone confirmada, fechamento IESA). */
  getAccountsReceivableByExternalId(externalId: string): Promise<AccountsReceivable | null>;
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
  /** Missão Financeiro V2 (Prioridade 4) — cadastro de um novo parceiro/mensalista real. */
  createPartner(input: CreatePartnerInput): Promise<Partner>;
  /** Missão Financeiro V2 (Prioridade 4) — cadastro de um novo contrato real (mensalista/parceria). */
  createContract(input: CreateContractInput): Promise<Contract>;

  // --- Fundação (fornecedores, contas financeiras, recorrências, plano de contas) ---
  listSuppliers(): Promise<Supplier[]>;
  listFinancialCategories(type?: FinancialCategoryType): Promise<FinancialCategory[]>;
  listCostCenters(): Promise<CostCenter[]>;
  listFinancialAccounts(): Promise<FinancialAccountBalance[]>;
  recordAccountTransfer(input: RecordAccountTransferInput): Promise<AccountTransfer>;
  listRecurringBillTemplates(): Promise<RecurringBillTemplate[]>;
  createRecurringBillTemplate(input: CreateRecurringBillTemplateInput): Promise<RecurringBillTemplate>;

  // --- Fluxo de Caixa ---
  /** Lançamento manual (entrada/saída/ajuste/estorno/taxa/tarifa/juros) — gera balanceBefore/After. */
  createCashMovement(input: CreateCashMovementInput): Promise<CashMovement>;
  /**
   * Vincula um `cash_movement` JÁ EXISTENTE a uma `accounts_receivable` — para regularizar um
   * recebimento real que foi lançado antes de sua conta a receber existir (ex.: Missão Financeiro
   * V4.2, regularização de março/2026 da IESA/Nissan). Nunca cria um novo cash_movement; lança erro
   * se o movimento já estiver vinculado a OUTRA conta a receber, para nunca sobrescrever um vínculo
   * real por engano.
   */
  linkCashMovementToReceivable(cashMovementId: string, accountsReceivableId: string): Promise<CashMovement>;
  /**
   * Simétrico a `linkCashMovementToReceivable`, para o lado de contas a pagar — Missão Financeiro
   * V4.4: uma compra já paga via Pix (cash_movement real, vindo do extrato) precisa ser vinculada
   * ao `accounts_payable` correspondente sem gerar um segundo movimento de caixa.
   */
  linkCashMovementToPayable(cashMovementId: string, accountsPayableId: string): Promise<CashMovement>;
  /** Grava o saldo conferido manualmente pelo usuário, para o alerta de divergência. */
  informAccountBalance(input: InformAccountBalanceInput): Promise<FinancialAccountBalance>;
  listAccountTransfers(): Promise<AccountTransfer[]>;

  // --- Contas a Pagar ---
  listAccountsPayable(): Promise<AccountsPayable[]>;
  getAccountsPayable(id: string): Promise<AccountsPayable | null>;
  /** Missão Financeiro V2 (Prioridade 8) — busca idempotente por origem (ex.: compra de estoque já lançada). */
  getAccountsPayableByExternalId(externalId: string): Promise<AccountsPayable | null>;
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
  /** Missão Financeiro V2.2 — grava um registro de auditoria genérico (reaproveitado pelo motor de classificação do extrato bancário, nunca uma tabela paralela). */
  createAuditLogEntry(input: { action: string; entityType: string; entityId: string; beforeState: Record<string, unknown> | null; afterState: Record<string, unknown> | null; notes?: string | null }): Promise<AuditLogEntry>;

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
