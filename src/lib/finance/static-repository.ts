import "server-only";
import type { FinanceRepository } from "@/lib/finance/repository";
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
  FinancialAccount,
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
import { initialAccountsReceivable } from "@/lib/finance/data/accounts-receivable";
import { initialCashMovements } from "@/lib/finance/data/cash-movements";
import { initialContracts, initialPartners } from "@/lib/finance/data/contracts";
import { initialSuppliers } from "@/lib/finance/data/suppliers";
import { initialFinancialAccounts } from "@/lib/finance/data/financial-accounts";
import { initialAccountTransfers } from "@/lib/finance/data/account-transfers";
import { initialRecurringBillTemplates } from "@/lib/finance/data/recurring-bill-templates";
import { initialAccountsPayable } from "@/lib/finance/data/accounts-payable";
import { initialFinancialCategories } from "@/lib/finance/data/financial-categories";
import { initialCostCenters } from "@/lib/finance/data/cost-centers";
import {
  computeAccountBalance,
  computeAccountsPayableStatus,
  computeInstallments,
  computeNetAmount,
  computeOutstanding,
  computeAccountsReceivableStatus,
  PayableOverpaymentError,
  ReceivableOverpaymentError,
} from "@/lib/finance/status";

/**
 * Implementação em memória, baseada em dados iniciais tipados no código — mesmo padrão de
 * src/lib/inventory/static-repository.ts. Mesma limitação crítica: em ambiente serverless
 * (Vercel), não há garantia de persistência entre invocações. Por isso as ações de escrita de
 * Contas a Pagar estão implementadas (arquitetura completa, testada), mas só têm efeito real e
 * duradouro quando `PostgresFinanceRepository` está ativo (DATABASE_URL configurada).
 */
export interface StaticFinanceRepositorySeed {
  accountsReceivable?: AccountsReceivable[];
  cashMovements?: CashMovement[];
  contracts?: Contract[];
  suppliers?: Supplier[];
  financialAccounts?: FinancialAccount[];
  accountTransfers?: AccountTransfer[];
  recurringBillTemplates?: RecurringBillTemplate[];
  accountsPayable?: AccountsPayable[];
}

let nextIdCounter = 1;
function generateId(prefix: string): string {
  return `${prefix}-${nextIdCounter++}`;
}

export class StaticFinanceRepository implements FinanceRepository {
  private accountsReceivable: AccountsReceivable[];
  private cashMovements: CashMovement[];
  private contracts: Contract[];
  private suppliers: Supplier[];
  private financialAccounts: FinancialAccount[];
  private accountTransfers: AccountTransfer[];
  private recurringBillTemplates: RecurringBillTemplate[];
  private accountsPayable: AccountsPayable[];
  private payableSettlements: PayableSettlement[] = [];
  private receivableSettlements: ReceivableSettlement[] = [];
  private auditLog: AuditLogEntry[] = [];
  private financialClassifications: FinancialClassification[] = [];
  private classificationRules: ClassificationRule[] = [];
  private allocationRules: AllocationRule[] = [];
  private accountingPeriods: AccountingPeriod[] = [];

  /** Aceita dados iniciais alternativos — usado pelos testes para preparar cenários específicos. */
  constructor(seed: StaticFinanceRepositorySeed = {}) {
    this.accountsReceivable = (seed.accountsReceivable ?? initialAccountsReceivable).map((item) => ({ ...item }));
    this.cashMovements = (seed.cashMovements ?? initialCashMovements).map((item) => ({ ...item }));
    this.contracts = (seed.contracts ?? initialContracts).map((item) => ({ ...item }));
    this.suppliers = (seed.suppliers ?? initialSuppliers).map((item) => ({ ...item }));
    this.financialAccounts = (seed.financialAccounts ?? initialFinancialAccounts).map((item) => ({ ...item }));
    this.accountTransfers = (seed.accountTransfers ?? initialAccountTransfers).map((item) => ({ ...item }));
    this.recurringBillTemplates = (seed.recurringBillTemplates ?? initialRecurringBillTemplates).map((item) => ({ ...item }));
    this.accountsPayable = (seed.accountsPayable ?? initialAccountsPayable).map((item) => ({ ...item }));
  }

  async listAccountsReceivable(): Promise<AccountsReceivable[]> {
    return this.accountsReceivable.map((item) => ({ ...item }));
  }

  async getAccountsReceivable(id: string): Promise<AccountsReceivable | null> {
    const item = this.accountsReceivable.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async recordPayment(input: RecordPaymentInput): Promise<AccountsReceivable> {
    const item = this.accountsReceivable.find((i) => i.id === input.accountsReceivableId);
    if (!item) throw new Error(`Conta a receber não encontrada: ${input.accountsReceivableId}`);

    item.receivedAmount += input.amount;
    item.outstandingAmount = computeOutstanding(item.expectedAmount, item.receivedAmount);
    item.receivedAt = input.paidAt;
    item.paymentMethod = input.method;
    item.status = computeAccountsReceivableStatus(item, input.paidAt);
    item.updatedAt = new Date().toISOString();

    return { ...item };
  }

  async createAccountsReceivable(input: CreateAccountsReceivableInput): Promise<AccountsReceivable[]> {
    const now = new Date().toISOString();
    const category = input.categoryId ? initialFinancialCategories.find((c) => c.id === input.categoryId) : undefined;
    const costCenter = input.costCenterId ? initialCostCenters.find((c) => c.id === input.costCenterId) : undefined;
    const financialAccount = input.financialAccountId
      ? this.financialAccounts.find((a) => a.id === input.financialAccountId)
      : undefined;
    const partyName = (input.partnerId ? initialPartners.find((p) => p.id === input.partnerId)?.name : undefined) ?? "Não informado";

    const installmentTotal = input.installmentTotal && input.installmentTotal > 1 ? input.installmentTotal : 1;
    const installmentGroupId = installmentTotal > 1 ? generateId("parcelamento-receita") : null;
    const installments = computeInstallments(input.expectedAmount, installmentTotal, input.dueDate);

    const created: AccountsReceivable[] = installments.map((installment) => {
      const row: AccountsReceivable = {
        id: generateId("conta-a-receber"),
        customerId: input.customerId ?? null,
        partnerId: input.partnerId ?? null,
        contractId: input.contractId ?? null,
        partyName,
        costCenterId: costCenter?.id ?? null,
        costCenterName: costCenter?.name ?? null,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        financialAccountId: input.financialAccountId ?? null,
        financialAccountName: financialAccount?.name ?? null,
        description: installmentTotal > 1 ? `${input.description} (${installment.number}/${installmentTotal})` : input.description,
        competenceDate: input.competenceDate,
        issueDate: input.issueDate ?? null,
        dueDate: installment.dueDate,
        expectedAmount: installment.amount,
        receivedAmount: 0,
        outstandingAmount: installment.amount,
        status: input.status ?? "open",
        paymentMethod: input.paymentMethod ?? "desconhecido",
        invoiceNumber: input.invoiceNumber ?? null,
        invoiceIssued: input.invoiceIssued ?? false,
        receivedAt: null,
        installmentGroupId,
        installmentNumber: installmentTotal > 1 ? installment.number : null,
        installmentTotal: installmentTotal > 1 ? installmentTotal : null,
        feeAmount: null,
        netAmount: null,
        responsibleName: input.responsibleName ?? null,
        approverName: input.approverName ?? null,
        source: "manual",
        externalId: null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.accountsReceivable.push(row);
      this.appendAudit("create", "accounts_receivable", row.id, null, row);
      return { ...row };
    });

    return created;
  }

  async updateAccountsReceivable(input: UpdateAccountsReceivableInput): Promise<AccountsReceivable> {
    const item = this.accountsReceivable.find((i) => i.id === input.id);
    if (!item) throw new Error(`Conta a receber não encontrada: ${input.id}`);
    const before = { ...item };

    if (input.description !== undefined) item.description = input.description;
    if (input.customerId !== undefined) item.customerId = input.customerId;
    if (input.partnerId !== undefined) item.partnerId = input.partnerId;
    if (input.contractId !== undefined) item.contractId = input.contractId;
    if (input.costCenterId !== undefined) {
      item.costCenterId = input.costCenterId;
      item.costCenterName = input.costCenterId ? initialCostCenters.find((c) => c.id === input.costCenterId)?.name ?? null : null;
    }
    if (input.categoryId !== undefined) {
      item.categoryId = input.categoryId;
      item.categoryName = input.categoryId ? initialFinancialCategories.find((c) => c.id === input.categoryId)?.name ?? null : null;
    }
    if (input.financialAccountId !== undefined) {
      item.financialAccountId = input.financialAccountId;
      item.financialAccountName = input.financialAccountId
        ? this.financialAccounts.find((a) => a.id === input.financialAccountId)?.name ?? null
        : null;
    }
    if (input.competenceDate !== undefined) item.competenceDate = input.competenceDate;
    if (input.issueDate !== undefined) item.issueDate = input.issueDate;
    if (input.dueDate !== undefined) item.dueDate = input.dueDate;
    if (input.expectedAmount !== undefined) {
      item.expectedAmount = input.expectedAmount;
      item.outstandingAmount = computeOutstanding(input.expectedAmount, item.receivedAmount);
    }
    if (input.paymentMethod !== undefined) item.paymentMethod = input.paymentMethod;
    if (input.invoiceNumber !== undefined) item.invoiceNumber = input.invoiceNumber;
    if (input.invoiceIssued !== undefined) item.invoiceIssued = input.invoiceIssued;
    if (input.notes !== undefined) item.notes = input.notes;
    if (input.responsibleName !== undefined) item.responsibleName = input.responsibleName;
    if (input.approverName !== undefined) item.approverName = input.approverName;
    item.updatedAt = new Date().toISOString();

    this.appendAudit("update", "accounts_receivable", item.id, before, item);
    return { ...item };
  }

  async recordReceivablePayment(input: RecordReceivablePaymentInput): Promise<AccountsReceivable> {
    const item = this.accountsReceivable.find((i) => i.id === input.accountsReceivableId);
    if (!item) throw new Error(`Conta a receber não encontrada: ${input.accountsReceivableId}`);

    if (input.amount > item.outstandingAmount && !input.allowOverpayment) {
      throw new ReceivableOverpaymentError(item.outstandingAmount, input.amount);
    }

    const before = { ...item };
    const financialAccount = input.financialAccountId
      ? this.financialAccounts.find((a) => a.id === input.financialAccountId)
      : undefined;
    const feeAmount = input.feeAmount ?? null;
    const netAmount = computeNetAmount(input.amount, feeAmount);

    const settlement: ReceivableSettlement = {
      id: generateId("recebimento"),
      accountsReceivableId: item.id,
      amount: input.amount,
      paidAt: input.paidAt,
      method: input.method,
      financialAccountId: input.financialAccountId ?? null,
      feeAmount,
      netAmount,
      reversed: false,
      reversedAt: null,
      notes: input.notes ?? null,
    };
    this.receivableSettlements.push(settlement);

    item.receivedAmount = Math.round((item.receivedAmount + input.amount) * 100) / 100;
    item.outstandingAmount = computeOutstanding(item.expectedAmount, item.receivedAmount);
    item.paymentMethod = input.method;
    item.receivedAt = input.paidAt;
    item.feeAmount = feeAmount !== null ? Math.round(((item.feeAmount ?? 0) + feeAmount) * 100) / 100 : item.feeAmount;
    item.netAmount = Math.round(((item.netAmount ?? 0) + netAmount) * 100) / 100;
    if (input.financialAccountId !== undefined) {
      item.financialAccountId = input.financialAccountId;
      item.financialAccountName = financialAccount?.name ?? null;
    }
    item.status = computeAccountsReceivableStatus(item, input.paidAt);
    item.updatedAt = new Date().toISOString();

    this.appendAudit("receive", "accounts_receivable", item.id, before, item);
    return { ...item };
  }

  async listReceivableSettlements(accountsReceivableId: string): Promise<ReceivableSettlement[]> {
    return this.receivableSettlements.filter((s) => s.accountsReceivableId === accountsReceivableId).map((s) => ({ ...s }));
  }

  async reverseReceivableSettlement(settlementId: string): Promise<AccountsReceivable> {
    const settlement = this.receivableSettlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error(`Recebimento não encontrado: ${settlementId}`);
    if (settlement.reversed) throw new Error("Este recebimento já foi estornado.");

    const item = this.accountsReceivable.find((i) => i.id === settlement.accountsReceivableId);
    if (!item) throw new Error(`Conta a receber não encontrada: ${settlement.accountsReceivableId}`);
    const before = { ...item };

    settlement.reversed = true;
    settlement.reversedAt = new Date().toISOString();

    item.receivedAmount = Math.round((item.receivedAmount - settlement.amount) * 100) / 100;
    item.outstandingAmount = computeOutstanding(item.expectedAmount, item.receivedAmount);
    item.netAmount =
      settlement.netAmount !== null ? Math.round(((item.netAmount ?? 0) - settlement.netAmount) * 100) / 100 : item.netAmount;
    /** "reversed" é status manual e distinto de "open"/"partially_paid" — marca explicitamente que houve estorno. */
    item.status = "reversed";
    item.updatedAt = new Date().toISOString();

    this.appendAudit("reverse_payment", "accounts_receivable", item.id, before, item);
    return { ...item };
  }

  async cancelAccountsReceivable(id: string): Promise<AccountsReceivable> {
    const item = this.accountsReceivable.find((i) => i.id === id);
    if (!item) throw new Error(`Conta a receber não encontrada: ${id}`);
    const before = { ...item };
    item.status = "cancelled";
    item.updatedAt = new Date().toISOString();
    this.appendAudit("cancel", "accounts_receivable", item.id, before, item);
    return { ...item };
  }

  async deleteAccountsReceivable(id: string): Promise<void> {
    const item = this.accountsReceivable.find((i) => i.id === id);
    if (!item) throw new Error(`Conta a receber não encontrada: ${id}`);
    const hasSettlements = this.receivableSettlements.some((s) => s.accountsReceivableId === id);
    if (hasSettlements) {
      throw new Error("Exclusão definitiva só é permitida quando não houver recebimentos registrados. Use cancelar.");
    }
    this.accountsReceivable = this.accountsReceivable.filter((i) => i.id !== id);
    this.appendAudit("delete", "accounts_receivable", id, item, null);
  }

  async listCashMovements(): Promise<CashMovement[]> {
    return this.cashMovements.map((item) => ({ ...item }));
  }

  private resolveCashMovementPartyName(customerId: string | null, partnerId: string | null, supplierId: string | null): string | null {
    if (partnerId) return initialPartners.find((p) => p.id === partnerId)?.name ?? null;
    if (customerId) return null; // sem seed de customers em memória — nunca inventado
    if (supplierId) return this.suppliers.find((s) => s.id === supplierId)?.name ?? null;
    return null;
  }

  async createCashMovement(input: CreateCashMovementInput): Promise<CashMovement> {
    const account = this.financialAccounts.find((a) => a.id === input.financialAccountId);
    if (!account) throw new Error(`Conta financeira não encontrada: ${input.financialAccountId}`);

    const movements = this.cashMovements.filter((m) => m.financialAccountId === input.financialAccountId);
    const transfersIn = this.accountTransfers.filter((t) => t.toAccountId === input.financialAccountId);
    const transfersOut = this.accountTransfers.filter((t) => t.fromAccountId === input.financialAccountId);
    const balanceBefore = computeAccountBalance(account.fixedFundAmount, movements, transfersIn, transfersOut);
    const balanceAfter = Math.round((balanceBefore + (input.type === "entrada" ? input.amount : -input.amount)) * 100) / 100;

    const category = input.categoryId ? initialFinancialCategories.find((c) => c.id === input.categoryId) : undefined;
    const costCenter = input.costCenterId ? initialCostCenters.find((c) => c.id === input.costCenterId) : undefined;

    const row: CashMovement = {
      id: generateId("movimento"),
      date: input.date,
      type: input.type,
      nature: input.nature ?? null,
      amount: input.amount,
      description: input.description,
      accountsReceivableId: null,
      accountsPayableId: null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      costCenterId: costCenter?.id ?? null,
      costCenterName: costCenter?.name ?? null,
      financialAccountId: input.financialAccountId,
      financialAccountName: account.name,
      paymentId: null,
      partnerId: input.partnerId ?? null,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      partyName: this.resolveCashMovementPartyName(input.customerId ?? null, input.partnerId ?? null, input.supplierId ?? null),
      responsibleName: input.responsibleName ?? null,
      documentRef: input.documentRef ?? null,
      competenceDate: input.competenceDate ?? null,
      balanceBefore,
      balanceAfter,
      source: "manual",
      externalId: null,
      notes: input.notes ?? null,
    };
    this.cashMovements.push(row);
    this.appendAudit("create", "cash_movement", row.id, null, row);
    return { ...row };
  }

  async informAccountBalance(input: InformAccountBalanceInput): Promise<FinancialAccountBalance> {
    const account = this.financialAccounts.find((a) => a.id === input.financialAccountId);
    if (!account) throw new Error(`Conta financeira não encontrada: ${input.financialAccountId}`);
    const before = { ...account };

    account.informedBalance = input.informedBalance;
    account.informedBalanceAt = new Date().toISOString();
    this.appendAudit("inform_balance", "financial_account", account.id, before, account);

    const movements = this.cashMovements.filter((m) => m.financialAccountId === account.id);
    const transfersIn = this.accountTransfers.filter((t) => t.toAccountId === account.id);
    const transfersOut = this.accountTransfers.filter((t) => t.fromAccountId === account.id);
    const currentBalance = computeAccountBalance(account.fixedFundAmount, movements, transfersIn, transfersOut);

    return {
      ...account,
      currentBalance,
      belowThreshold: account.fixedFundAmount !== null && currentBalance < account.fixedFundAmount,
    };
  }

  async listContracts(): Promise<Contract[]> {
    return this.contracts.map((item) => ({ ...item }));
  }

  async listPartners(): Promise<Partner[]> {
    return initialPartners.map((item) => ({ ...item }));
  }

  async listSuppliers(): Promise<Supplier[]> {
    return this.suppliers.map((item) => ({ ...item }));
  }

  async listFinancialCategories(type?: FinancialCategoryType): Promise<FinancialCategory[]> {
    const all = initialFinancialCategories.map((item) => ({ ...item }));
    return type ? all.filter((c) => c.type === type) : all;
  }

  async listCostCenters(): Promise<CostCenter[]> {
    return initialCostCenters.map((item) => ({ ...item }));
  }

  async listFinancialAccounts(): Promise<FinancialAccountBalance[]> {
    return this.financialAccounts.map((account) => {
      const movements = this.cashMovements.filter((m) => m.financialAccountId === account.id);
      const transfersIn = this.accountTransfers.filter((t) => t.toAccountId === account.id);
      const transfersOut = this.accountTransfers.filter((t) => t.fromAccountId === account.id);
      const currentBalance = computeAccountBalance(account.fixedFundAmount, movements, transfersIn, transfersOut);
      return {
        ...account,
        currentBalance,
        belowThreshold: account.fixedFundAmount !== null && currentBalance < account.fixedFundAmount,
      };
    });
  }

  async recordAccountTransfer(input: RecordAccountTransferInput): Promise<AccountTransfer> {
    const fromAccountId = input.fromAccountId ?? null;
    const toAccountId = input.toAccountId ?? null;
    const transfer: AccountTransfer = {
      id: generateId("transferencia"),
      type: input.type,
      fromAccountId,
      fromAccountName: fromAccountId ? this.financialAccounts.find((a) => a.id === fromAccountId)?.name ?? null : null,
      toAccountId,
      toAccountName: toAccountId ? this.financialAccounts.find((a) => a.id === toAccountId)?.name ?? null : null,
      amount: input.amount,
      date: input.date,
      description: input.description,
      responsibleName: input.responsibleName ?? null,
      documentRef: input.documentRef ?? null,
      notes: input.notes ?? null,
    };
    this.accountTransfers.push(transfer);
    return { ...transfer };
  }

  async listAccountTransfers(): Promise<AccountTransfer[]> {
    return this.accountTransfers.map((item) => ({ ...item }));
  }

  async listRecurringBillTemplates(): Promise<RecurringBillTemplate[]> {
    return this.recurringBillTemplates.map((item) => ({ ...item }));
  }

  async listAccountsPayable(): Promise<AccountsPayable[]> {
    return this.accountsPayable.map((item) => ({ ...item }));
  }

  async getAccountsPayable(id: string): Promise<AccountsPayable | null> {
    const item = this.accountsPayable.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async createAccountsPayable(input: CreateAccountsPayableInput): Promise<AccountsPayable[]> {
    const now = new Date().toISOString();
    const supplier = input.supplierId ? this.suppliers.find((s) => s.id === input.supplierId) : undefined;
    const category = { id: input.categoryId, name: input.categoryId };
    const costCenter = input.costCenterId ? { id: input.costCenterId, name: input.costCenterId } : undefined;
    const financialAccount = input.financialAccountId
      ? this.financialAccounts.find((a) => a.id === input.financialAccountId)
      : undefined;

    const installmentTotal = input.installmentTotal && input.installmentTotal > 1 ? input.installmentTotal : 1;
    const installmentGroupId = installmentTotal > 1 ? generateId("parcelamento") : null;
    const installments = computeInstallments(input.originalAmount, installmentTotal, input.dueDate);

    const created: AccountsPayable[] = installments.map((installment) => {
      const row: AccountsPayable = {
        id: generateId("conta-a-pagar"),
        description: installmentTotal > 1 ? `${input.description} (${installment.number}/${installmentTotal})` : input.description,
        supplierId: input.supplierId ?? null,
        supplierName: supplier?.name ?? null,
        categoryId: category.id,
        categoryName: category.name,
        costCenterId: costCenter?.id ?? null,
        costCenterName: costCenter?.name ?? null,
        financialAccountId: input.financialAccountId ?? null,
        financialAccountName: financialAccount?.name ?? null,
        competenceDate: input.competenceDate,
        issueDate: input.issueDate ?? null,
        dueDate: installment.dueDate,
        originalAmount: installment.amount,
        paidAmount: 0,
        outstandingAmount: installment.amount,
        paymentMethod: input.paymentMethod ?? "desconhecido",
        documentNumber: input.documentNumber ?? null,
        status: input.status ?? "pendente",
        pendingData: input.pendingData ?? false,
        recurringBillTemplateId: input.recurringBillTemplateId ?? null,
        installmentGroupId,
        installmentNumber: installmentTotal > 1 ? installment.number : null,
        installmentTotal: installmentTotal > 1 ? installmentTotal : null,
        attachmentRef: null,
        source: "manual",
        externalId: null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.accountsPayable.push(row);
      this.appendAudit("create", "accounts_payable", row.id, null, row);
      return { ...row };
    });

    return created;
  }

  async updateAccountsPayable(input: UpdateAccountsPayableInput): Promise<AccountsPayable> {
    const item = this.accountsPayable.find((i) => i.id === input.id);
    if (!item) throw new Error(`Conta a pagar não encontrada: ${input.id}`);
    const before = { ...item };

    if (input.description !== undefined) item.description = input.description;
    if (input.supplierId !== undefined) {
      item.supplierId = input.supplierId;
      item.supplierName = input.supplierId ? this.suppliers.find((s) => s.id === input.supplierId)?.name ?? null : null;
    }
    if (input.categoryId !== undefined) {
      item.categoryId = input.categoryId;
      item.categoryName = input.categoryId;
    }
    if (input.costCenterId !== undefined) {
      item.costCenterId = input.costCenterId;
      item.costCenterName = input.costCenterId;
    }
    if (input.financialAccountId !== undefined) {
      item.financialAccountId = input.financialAccountId;
      item.financialAccountName = input.financialAccountId
        ? this.financialAccounts.find((a) => a.id === input.financialAccountId)?.name ?? null
        : null;
    }
    if (input.competenceDate !== undefined) item.competenceDate = input.competenceDate;
    if (input.issueDate !== undefined) item.issueDate = input.issueDate;
    if (input.dueDate !== undefined) item.dueDate = input.dueDate;
    if (input.originalAmount !== undefined) {
      item.originalAmount = input.originalAmount;
      item.outstandingAmount = computeOutstanding(input.originalAmount, item.paidAmount);
    }
    if (input.paymentMethod !== undefined) item.paymentMethod = input.paymentMethod;
    if (input.documentNumber !== undefined) item.documentNumber = input.documentNumber;
    if (input.notes !== undefined) item.notes = input.notes;
    if (input.pendingData !== undefined) item.pendingData = input.pendingData;
    item.updatedAt = new Date().toISOString();

    this.appendAudit("update", "accounts_payable", item.id, before, item);
    return { ...item };
  }

  async recordPayablePayment(input: RecordPayablePaymentInput): Promise<AccountsPayable> {
    const item = this.accountsPayable.find((i) => i.id === input.accountsPayableId);
    if (!item) throw new Error(`Conta a pagar não encontrada: ${input.accountsPayableId}`);

    if (input.amount > item.outstandingAmount && !input.allowOverpayment) {
      throw new PayableOverpaymentError(item.outstandingAmount, input.amount);
    }

    const before = { ...item };
    const financialAccount = input.financialAccountId
      ? this.financialAccounts.find((a) => a.id === input.financialAccountId)
      : undefined;

    const settlement: PayableSettlement = {
      id: generateId("baixa"),
      accountsPayableId: item.id,
      amount: input.amount,
      paidAt: input.paidAt,
      method: input.method,
      financialAccountId: input.financialAccountId ?? null,
      reversed: false,
      reversedAt: null,
      notes: input.notes ?? null,
    };
    this.payableSettlements.push(settlement);

    item.paidAmount += input.amount;
    item.outstandingAmount = computeOutstanding(item.originalAmount, item.paidAmount);
    item.paymentMethod = input.method;
    if (input.financialAccountId !== undefined) {
      item.financialAccountId = input.financialAccountId;
      item.financialAccountName = financialAccount?.name ?? null;
    }
    item.status = computeAccountsPayableStatus(item, input.paidAt);
    item.updatedAt = new Date().toISOString();

    this.appendAudit("pay", "accounts_payable", item.id, before, item);
    return { ...item };
  }

  async listPayableSettlements(accountsPayableId: string): Promise<PayableSettlement[]> {
    return this.payableSettlements.filter((s) => s.accountsPayableId === accountsPayableId).map((s) => ({ ...s }));
  }

  async reversePayableSettlement(settlementId: string): Promise<AccountsPayable> {
    const settlement = this.payableSettlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error(`Baixa não encontrada: ${settlementId}`);
    if (settlement.reversed) throw new Error("Esta baixa já foi estornada.");

    const item = this.accountsPayable.find((i) => i.id === settlement.accountsPayableId);
    if (!item) throw new Error(`Conta a pagar não encontrada: ${settlement.accountsPayableId}`);
    const before = { ...item };

    settlement.reversed = true;
    settlement.reversedAt = new Date().toISOString();

    item.paidAmount = Math.round((item.paidAmount - settlement.amount) * 100) / 100;
    item.outstandingAmount = computeOutstanding(item.originalAmount, item.paidAmount);
    item.status = computeAccountsPayableStatus(item, new Date().toISOString().slice(0, 10));
    item.updatedAt = new Date().toISOString();

    this.appendAudit("reverse_payment", "accounts_payable", item.id, before, item);
    return { ...item };
  }

  async cancelAccountsPayable(id: string): Promise<AccountsPayable> {
    const item = this.accountsPayable.find((i) => i.id === id);
    if (!item) throw new Error(`Conta a pagar não encontrada: ${id}`);
    const before = { ...item };
    item.status = "cancelada";
    item.updatedAt = new Date().toISOString();
    this.appendAudit("cancel", "accounts_payable", item.id, before, item);
    return { ...item };
  }

  async deleteAccountsPayable(id: string): Promise<void> {
    const item = this.accountsPayable.find((i) => i.id === id);
    if (!item) throw new Error(`Conta a pagar não encontrada: ${id}`);
    const hasSettlements = this.payableSettlements.some((s) => s.accountsPayableId === id);
    if (hasSettlements) {
      throw new Error("Exclusão definitiva só é permitida quando não houver pagamentos registrados. Use cancelar.");
    }
    this.accountsPayable = this.accountsPayable.filter((i) => i.id !== id);
    this.appendAudit("delete", "accounts_payable", id, item, null);
  }

  async listAuditLog(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.auditLog
      .filter((entry) => entry.entityType === entityType && entry.entityId === entityId)
      .map((entry) => ({ ...entry }));
  }

  private appendAudit(action: string, entityType: string, entityId: string, before: unknown, after: unknown): void {
    this.auditLog.push({
      id: generateId("audit"),
      actorUserId: null,
      action,
      entityType,
      entityId,
      beforeState: before as Record<string, unknown> | null,
      afterState: after as Record<string, unknown> | null,
      createdAt: new Date().toISOString(),
    });
  }

  // --- Contabilidade Gerencial ---

  async listFinancialClassifications(): Promise<FinancialClassification[]> {
    return this.financialClassifications.map((c) => ({ ...c }));
  }

  async classifyEntity(input: ClassifyEntityInput): Promise<FinancialClassification> {
    const columnMap: Record<ClassifyEntityInput["sourceKind"], keyof FinancialClassification> = {
      accounts_payable: "accountsPayableId",
      accounts_receivable: "accountsReceivableId",
      cash_movement: "cashMovementId",
      account_transfer: "accountTransferId",
    };
    const key = columnMap[input.sourceKind];
    const existing = this.financialClassifications.find((c) => c[key] === input.sourceId);
    const now = new Date().toISOString();

    const row: FinancialClassification = {
      id: existing?.id ?? generateId("classificacao"),
      accountsPayableId: input.sourceKind === "accounts_payable" ? input.sourceId : null,
      accountsReceivableId: input.sourceKind === "accounts_receivable" ? input.sourceId : null,
      cashMovementId: input.sourceKind === "cash_movement" ? input.sourceId : null,
      accountTransferId: input.sourceKind === "account_transfer" ? input.sourceId : null,
      dreLine: input.dreLine,
      nature: input.nature,
      includeInDre: input.includeInDre ?? true,
      origin: "manual",
      reviewNeeded: input.reviewNeeded ?? false,
      classifiedBy: input.classifiedBy ?? null,
      notes: input.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const before = existing ? { ...existing } : null;
    if (existing) {
      this.financialClassifications = this.financialClassifications.map((c) => (c.id === existing.id ? row : c));
    } else {
      this.financialClassifications.push(row);
    }
    this.appendAudit(existing ? "update" : "create", "financial_classification", row.id, before, row);

    if (input.createRule) {
      this.classificationRules.push({
        id: generateId("regra"),
        matchType: input.createRule.matchType,
        supplierId: input.createRule.supplierId ?? null,
        supplierName: input.createRule.supplierId ? this.suppliers.find((s) => s.id === input.createRule!.supplierId)?.name ?? null : null,
        partnerId: input.createRule.partnerId ?? null,
        partnerName: input.createRule.partnerId ? initialPartners.find((p) => p.id === input.createRule!.partnerId)?.name ?? null : null,
        categoryId: input.createRule.categoryId ?? null,
        categoryName: input.createRule.categoryId ? initialFinancialCategories.find((c) => c.id === input.createRule!.categoryId)?.name ?? null : null,
        keyword: input.createRule.keyword ?? null,
        dreLine: input.dreLine,
        nature: input.nature,
        suggestedCostCenterId: null,
        suggestedCostCenterName: null,
        includeInDre: input.includeInDre ?? true,
        reviewNeeded: input.reviewNeeded ?? false,
        enabled: true,
        notes: null,
      });
    }

    return { ...row };
  }

  async listClassificationRules(): Promise<ClassificationRule[]> {
    return this.classificationRules.map((r) => ({ ...r }));
  }

  async createClassificationRule(input: CreateClassificationRuleInput): Promise<ClassificationRule> {
    const rule: ClassificationRule = {
      id: generateId("regra"),
      matchType: input.matchType,
      supplierId: input.supplierId ?? null,
      supplierName: input.supplierId ? this.suppliers.find((s) => s.id === input.supplierId)?.name ?? null : null,
      partnerId: input.partnerId ?? null,
      partnerName: input.partnerId ? initialPartners.find((p) => p.id === input.partnerId)?.name ?? null : null,
      categoryId: input.categoryId ?? null,
      categoryName: input.categoryId ? initialFinancialCategories.find((c) => c.id === input.categoryId)?.name ?? null : null,
      keyword: input.keyword ?? null,
      dreLine: input.dreLine,
      nature: input.nature,
      suggestedCostCenterId: input.suggestedCostCenterId ?? null,
      suggestedCostCenterName: input.suggestedCostCenterId ? initialCostCenters.find((c) => c.id === input.suggestedCostCenterId)?.name ?? null : null,
      includeInDre: input.includeInDre ?? true,
      reviewNeeded: input.reviewNeeded ?? false,
      enabled: input.enabled ?? true,
      notes: input.notes ?? null,
    };
    this.classificationRules.push(rule);
    this.appendAudit("create", "classification_rule", rule.id, null, rule);
    return { ...rule };
  }

  async deleteClassificationRule(id: string): Promise<void> {
    const rule = this.classificationRules.find((r) => r.id === id);
    if (!rule) throw new Error(`Regra de classificação não encontrada: ${id}`);
    this.classificationRules = this.classificationRules.filter((r) => r.id !== id);
    this.appendAudit("delete", "classification_rule", id, rule, null);
  }

  async listAllocationRules(): Promise<AllocationRule[]> {
    return this.allocationRules.map((r) => ({ ...r, shares: r.shares.map((s) => ({ ...s })) }));
  }

  async createAllocationRule(input: CreateAllocationRuleInput): Promise<AllocationRule> {
    const total = Math.round(input.shares.reduce((sum, s) => sum + s.percentage, 0) * 100) / 100;
    if (total !== 100) {
      throw new Error(`A soma dos percentuais do rateio deve ser exatamente 100% (atual: ${total}%).`);
    }
    const rule: AllocationRule = {
      id: generateId("rateio"),
      name: input.name,
      description: input.description ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
      shares: input.shares.map((s) => ({
        costCenterId: s.costCenterId,
        costCenterName: initialCostCenters.find((c) => c.id === s.costCenterId)?.name ?? "Não informado",
        percentage: s.percentage,
      })),
      notes: input.notes ?? null,
    };
    this.allocationRules.push(rule);
    this.appendAudit("create", "allocation_rule", rule.id, null, rule);
    return { ...rule, shares: rule.shares.map((s) => ({ ...s })) };
  }

  async listAccountingPeriods(): Promise<AccountingPeriod[]> {
    return this.accountingPeriods.map((p) => ({ ...p }));
  }

  async getAccountingPeriod(competenceMonth: string): Promise<AccountingPeriod | null> {
    const period = this.accountingPeriods.find((p) => p.competenceMonth === competenceMonth);
    return period ? { ...period } : null;
  }

  async closeAccountingPeriod(input: CloseAccountingPeriodInput): Promise<AccountingPeriod> {
    const existing = this.accountingPeriods.find((p) => p.competenceMonth === input.competenceMonth);
    if (existing?.status === "fechado") throw new Error(`Competência ${input.competenceMonth} já está fechada.`);

    const period: AccountingPeriod = {
      id: existing?.id ?? generateId("competencia"),
      competenceMonth: input.competenceMonth,
      status: "fechado",
      closedBy: input.closedBy,
      closedAt: new Date().toISOString(),
      reopenedBy: existing?.reopenedBy ?? null,
      reopenedAt: existing?.reopenedAt ?? null,
      reopenJustification: existing?.reopenJustification ?? null,
      notes: input.notes ?? null,
    };
    const before = existing ? { ...existing } : null;
    if (existing) {
      this.accountingPeriods = this.accountingPeriods.map((p) => (p.id === existing.id ? period : p));
    } else {
      this.accountingPeriods.push(period);
    }
    this.appendAudit("close", "accounting_period", period.id, before, period);
    return { ...period };
  }

  async reopenAccountingPeriod(input: ReopenAccountingPeriodInput): Promise<AccountingPeriod> {
    const existing = this.accountingPeriods.find((p) => p.competenceMonth === input.competenceMonth);
    if (!existing) throw new Error(`Competência ${input.competenceMonth} nunca foi fechada.`);
    if (existing.status !== "fechado") throw new Error(`Competência ${input.competenceMonth} não está fechada.`);
    if (!input.reopenJustification.trim()) throw new Error("Justificativa obrigatória para reabrir uma competência.");

    const before = { ...existing };
    const updated: AccountingPeriod = {
      ...existing,
      status: "reaberto",
      reopenedBy: input.reopenedBy,
      reopenedAt: new Date().toISOString(),
      reopenJustification: input.reopenJustification,
    };
    this.accountingPeriods = this.accountingPeriods.map((p) => (p.id === existing.id ? updated : p));
    this.appendAudit("reopen", "accounting_period", updated.id, before, updated);
    return { ...updated };
  }
}
