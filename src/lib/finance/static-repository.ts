import "server-only";
import type { FinanceRepository } from "@/lib/finance/repository";
import type {
  AccountsPayable,
  AccountsReceivable,
  AccountTransfer,
  AuditLogEntry,
  CashMovement,
  Contract,
  CostCenter,
  CreateAccountsPayableInput,
  FinancialAccount,
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
import { initialAccountsReceivable } from "@/lib/finance/data/accounts-receivable";
import { initialCashMovements } from "@/lib/finance/data/cash-movements";
import { initialContracts } from "@/lib/finance/data/contracts";
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
  computeOutstanding,
  computeAccountsReceivableStatus,
  PayableOverpaymentError,
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
  private auditLog: AuditLogEntry[] = [];

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

  async listCashMovements(): Promise<CashMovement[]> {
    return this.cashMovements.map((item) => ({ ...item }));
  }

  async listContracts(): Promise<Contract[]> {
    return this.contracts.map((item) => ({ ...item }));
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
    const transfer: AccountTransfer = {
      id: generateId("transferencia"),
      type: input.type,
      fromAccountId: input.fromAccountId ?? null,
      toAccountId: input.toAccountId ?? null,
      amount: input.amount,
      date: input.date,
      description: input.description,
      notes: input.notes ?? null,
    };
    this.accountTransfers.push(transfer);
    return { ...transfer };
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
}
