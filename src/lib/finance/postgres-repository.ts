import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accountingPeriods as accountingPeriodsTable,
  accountsPayable as accountsPayableTable,
  accountsReceivable as accountsReceivableTable,
  accountTransfers as accountTransfersTable,
  allocationRuleShares as allocationRuleSharesTable,
  allocationRules as allocationRulesTable,
  auditLogs as auditLogsTable,
  cashMovements as cashMovementsTable,
  classificationRules as classificationRulesTable,
  contractBenefits as contractBenefitsTable,
  contractValuePeriods as contractValuePeriodsTable,
  contracts as contractsTable,
  customers as customersTable,
  financialClassifications as financialClassificationsTable,
  financialAccounts as financialAccountsTable,
  partners as partnersTable,
  payments as paymentsTable,
  recurringBillTemplates as recurringBillTemplatesTable,
  suppliers as suppliersTable,
  financialCategories as financialCategoriesTable,
  costCenters as costCentersTable,
} from "@/db/schema";
import type { FinanceRepository } from "@/lib/finance/repository";
import type {
  AccountingPeriod,
  AccountingPeriodStatus,
  AccountsPayable,
  AccountsPayableStatus,
  AccountsReceivable,
  AccountsReceivableStatus,
  AccountTransfer,
  AccountTransferType,
  AllocationRule,
  AuditLogEntry,
  CashMovement,
  CashMovementNature,
  CashMovementType,
  ClassificationMatchType,
  ClassificationOrigin,
  ClassificationRule,
  ClassifyEntityInput,
  CloseAccountingPeriodInput,
  Contract,
  ContractStatus,
  ContractType,
  CostCenter,
  CreateAccountsPayableInput,
  CreateAccountsReceivableInput,
  CreateAllocationRuleInput,
  CreateCashMovementInput,
  CreateClassificationRuleInput,
  DreLine,
  FinancePaymentMethod,
  FinancialAccountBalance,
  FinancialAccountType,
  FinancialCategory,
  FinancialCategoryType,
  FinancialClassification,
  FinancialNature,
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
import {
  computeAccountBalance,
  computeAccountsPayableStatus,
  computeAccountsReceivableStatus,
  computeInstallments,
  computeNetAmount,
  computeOutstanding,
  PayableOverpaymentError,
  ReceivableOverpaymentError,
} from "@/lib/finance/status";

function toPaymentReceivableSettlement(row: typeof paymentsTable.$inferSelect): ReceivableSettlement {
  return {
    id: row.id,
    accountsReceivableId: row.accountsReceivableId as string,
    amount: Number(row.amount),
    paidAt: row.paidAt,
    method: row.method as FinancePaymentMethod,
    financialAccountId: row.financialAccountId,
    feeAmount: row.feeAmount !== null ? Number(row.feeAmount) : null,
    netAmount: row.netAmount !== null ? Number(row.netAmount) : null,
    reversed: row.reversed,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    notes: row.notes,
  };
}

function toSupplier(row: typeof suppliersTable.$inferSelect): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
  };
}

function toPayableSettlement(row: typeof paymentsTable.$inferSelect): PayableSettlement {
  return {
    id: row.id,
    accountsPayableId: row.accountsPayableId as string,
    amount: Number(row.amount),
    paidAt: row.paidAt,
    method: row.method as FinancePaymentMethod,
    financialAccountId: row.financialAccountId,
    reversed: row.reversed,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    notes: row.notes,
  };
}

function toAuditLogEntry(row: typeof auditLogsTable.$inferSelect): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId as string,
    beforeState: row.beforeState as Record<string, unknown> | null,
    afterState: row.afterState as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Implementação real, ativada automaticamente quando DATABASE_URL está configurada
 * (ver src/lib/finance/repository-factory.ts). Não é exercitada em runtime nesta execução
 * porque não há banco configurado — mas compila e é validada por typecheck/build.
 */
export class PostgresFinanceRepository implements FinanceRepository {
  private db() {
    const db = getDb();
    if (!db) {
      throw new Error(
        "PostgresFinanceRepository foi instanciado sem DATABASE_URL configurada. Isso indica um bug na seleção automática de repositório (repository-factory.ts).",
      );
    }
    return db;
  }

  private async toAccountsReceivable(row: typeof accountsReceivableTable.$inferSelect): Promise<AccountsReceivable> {
    const db = this.db();
    const partyName = await this.resolvePartyName(row.customerId, row.partnerId);

    let costCenterName: string | null = null;
    if (row.costCenterId) {
      const [cc] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, row.costCenterId)).limit(1);
      costCenterName = cc?.name ?? null;
    }
    let categoryName: string | null = null;
    if (row.categoryId) {
      const [cat] = await db.select().from(financialCategoriesTable).where(eq(financialCategoriesTable.id, row.categoryId)).limit(1);
      categoryName = cat?.name ?? null;
    }
    let financialAccountName: string | null = null;
    if (row.financialAccountId) {
      const [fa] = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, row.financialAccountId)).limit(1);
      financialAccountName = fa?.name ?? null;
    }

    return {
      id: row.id,
      customerId: row.customerId,
      partnerId: row.partnerId,
      contractId: row.contractId,
      partyName,
      costCenterId: row.costCenterId,
      costCenterName,
      categoryId: row.categoryId,
      categoryName,
      financialAccountId: row.financialAccountId,
      financialAccountName,
      description: row.description,
      competenceDate: row.competenceDate,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      expectedAmount: Number(row.expectedAmount),
      receivedAmount: Number(row.receivedAmount),
      outstandingAmount: Number(row.outstandingAmount),
      status: row.status as AccountsReceivableStatus,
      paymentMethod: row.paymentMethod as FinancePaymentMethod,
      invoiceNumber: row.invoiceNumber,
      invoiceIssued: row.invoiceIssued,
      receivedAt: row.receivedAt,
      installmentGroupId: row.installmentGroupId,
      installmentNumber: row.installmentNumber,
      installmentTotal: row.installmentTotal,
      feeAmount: row.feeAmount !== null ? Number(row.feeAmount) : null,
      netAmount: row.netAmount !== null ? Number(row.netAmount) : null,
      responsibleName: row.responsibleName,
      approverName: row.approverName,
      source: row.source,
      externalId: row.externalId,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listAccountsReceivable(): Promise<AccountsReceivable[]> {
    const rows = await this.db().select().from(accountsReceivableTable).where(eq(accountsReceivableTable.active, true));
    const results: AccountsReceivable[] = [];
    for (const row of rows) results.push(await this.toAccountsReceivable(row));
    return results;
  }

  async getAccountsReceivable(id: string): Promise<AccountsReceivable | null> {
    const rows = await this.db().select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, id)).limit(1);
    if (!rows[0]) return null;
    return this.toAccountsReceivable(rows[0]);
  }

  async recordPayment(input: RecordPaymentInput): Promise<AccountsReceivable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(accountsReceivableTable)
        .where(eq(accountsReceivableTable.id, input.accountsReceivableId))
        .limit(1);
      if (!row) throw new Error(`Conta a receber não encontrada: ${input.accountsReceivableId}`);

      const receivedAmount = Number(row.receivedAmount) + input.amount;
      const outstandingAmount = computeOutstanding(Number(row.expectedAmount), receivedAmount);
      const status = computeAccountsReceivableStatus(
        { status: row.status as AccountsReceivableStatus, outstandingAmount, receivedAmount, dueDate: row.dueDate },
        input.paidAt,
      );

      const [updated] = await tx
        .update(accountsReceivableTable)
        .set({
          receivedAmount: String(receivedAmount),
          outstandingAmount: String(outstandingAmount),
          status,
          paymentMethod: input.method,
          receivedAt: input.paidAt,
          updatedAt: new Date(),
        })
        .where(eq(accountsReceivableTable.id, input.accountsReceivableId))
        .returning();

      return this.toAccountsReceivable(updated);
    });
  }

  async createAccountsReceivable(input: CreateAccountsReceivableInput): Promise<AccountsReceivable[]> {
    const db = this.db();
    const installmentTotal = input.installmentTotal && input.installmentTotal > 1 ? input.installmentTotal : 1;
    const installments = computeInstallments(input.expectedAmount, installmentTotal, input.dueDate);
    const installmentGroupId = installmentTotal > 1 ? crypto.randomUUID() : null;

    return db.transaction(async (tx) => {
      const created: AccountsReceivable[] = [];
      for (const installment of installments) {
        const [row] = await tx
          .insert(accountsReceivableTable)
          .values({
            customerId: input.customerId ?? null,
            partnerId: input.partnerId ?? null,
            contractId: input.contractId ?? null,
            costCenterId: input.costCenterId ?? null,
            categoryId: input.categoryId ?? null,
            financialAccountId: input.financialAccountId ?? null,
            description: installmentTotal > 1 ? `${input.description} (${installment.number}/${installmentTotal})` : input.description,
            competenceDate: input.competenceDate,
            issueDate: input.issueDate ?? null,
            dueDate: installment.dueDate,
            expectedAmount: String(installment.amount),
            receivedAmount: "0",
            outstandingAmount: String(installment.amount),
            status: input.status ?? "open",
            paymentMethod: input.paymentMethod ?? "desconhecido",
            invoiceNumber: input.invoiceNumber ?? null,
            invoiceIssued: input.invoiceIssued ?? false,
            installmentGroupId,
            installmentNumber: installmentTotal > 1 ? installment.number : null,
            installmentTotal: installmentTotal > 1 ? installmentTotal : null,
            responsibleName: input.responsibleName ?? null,
            approverName: input.approverName ?? null,
            source: "manual",
            notes: input.notes ?? null,
          })
          .returning();

        await tx.insert(auditLogsTable).values({
          action: "create",
          entityType: "accounts_receivable",
          entityId: row.id,
          beforeState: null,
          afterState: row,
          source: "manual",
        });

        created.push(await this.toAccountsReceivable(row));
      }
      return created;
    });
  }

  async updateAccountsReceivable(input: UpdateAccountsReceivableInput): Promise<AccountsReceivable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, input.id)).limit(1);
      if (!before) throw new Error(`Conta a receber não encontrada: ${input.id}`);

      const newExpectedAmount = input.expectedAmount !== undefined ? input.expectedAmount : Number(before.expectedAmount);
      const outstandingAmount = computeOutstanding(newExpectedAmount, Number(before.receivedAmount));

      const [updated] = await tx
        .update(accountsReceivableTable)
        .set({
          ...(input.description !== undefined && { description: input.description }),
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          ...(input.partnerId !== undefined && { partnerId: input.partnerId }),
          ...(input.contractId !== undefined && { contractId: input.contractId }),
          ...(input.costCenterId !== undefined && { costCenterId: input.costCenterId }),
          ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
          ...(input.financialAccountId !== undefined && { financialAccountId: input.financialAccountId }),
          ...(input.competenceDate !== undefined && { competenceDate: input.competenceDate }),
          ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.expectedAmount !== undefined && { expectedAmount: String(input.expectedAmount), outstandingAmount: String(outstandingAmount) }),
          ...(input.paymentMethod !== undefined && { paymentMethod: input.paymentMethod }),
          ...(input.invoiceNumber !== undefined && { invoiceNumber: input.invoiceNumber }),
          ...(input.invoiceIssued !== undefined && { invoiceIssued: input.invoiceIssued }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.responsibleName !== undefined && { responsibleName: input.responsibleName }),
          ...(input.approverName !== undefined && { approverName: input.approverName }),
          updatedAt: new Date(),
        })
        .where(eq(accountsReceivableTable.id, input.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "update",
        entityType: "accounts_receivable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsReceivable(updated);
    });
  }

  async recordReceivablePayment(input: RecordReceivablePaymentInput): Promise<AccountsReceivable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, input.accountsReceivableId)).limit(1);
      if (!before) throw new Error(`Conta a receber não encontrada: ${input.accountsReceivableId}`);

      const outstandingAmount = Number(before.outstandingAmount);
      if (input.amount > outstandingAmount && !input.allowOverpayment) {
        throw new ReceivableOverpaymentError(outstandingAmount, input.amount);
      }

      const feeAmount = input.feeAmount ?? null;
      const netAmount = computeNetAmount(input.amount, feeAmount);

      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          accountsReceivableId: before.id,
          financialAccountId: input.financialAccountId ?? null,
          amount: String(input.amount),
          paidAt: input.paidAt,
          method: input.method,
          feeAmount: feeAmount !== null ? String(feeAmount) : null,
          netAmount: String(netAmount),
          source: "manual",
          notes: input.notes ?? null,
        })
        .returning();

      // Movimento de caixa real, para que o saldo da conta reflita o recebimento e fique
      // preparado para conciliação bancária futura — só quando a conta foi informada.
      if (input.financialAccountId) {
        await tx.insert(cashMovementsTable).values({
          date: input.paidAt,
          type: "entrada",
          amount: String(input.amount),
          description: `Recebimento: ${before.description}`,
          accountsReceivableId: before.id,
          categoryId: before.categoryId,
          costCenterId: before.costCenterId,
          financialAccountId: input.financialAccountId,
          paymentId: payment.id,
          source: "manual",
        });
      }

      const receivedAmount = Math.round((Number(before.receivedAmount) + input.amount) * 100) / 100;
      const newOutstanding = computeOutstanding(Number(before.expectedAmount), receivedAmount);
      const status = computeAccountsReceivableStatus(
        { status: before.status as AccountsReceivableStatus, outstandingAmount: newOutstanding, receivedAmount, dueDate: before.dueDate },
        input.paidAt,
      );
      const totalFee = feeAmount !== null ? Math.round(((before.feeAmount !== null ? Number(before.feeAmount) : 0) + feeAmount) * 100) / 100 : (before.feeAmount !== null ? Number(before.feeAmount) : null);
      const totalNet = Math.round(((before.netAmount !== null ? Number(before.netAmount) : 0) + netAmount) * 100) / 100;

      const [updated] = await tx
        .update(accountsReceivableTable)
        .set({
          receivedAmount: String(receivedAmount),
          outstandingAmount: String(newOutstanding),
          paymentMethod: input.method,
          receivedAt: input.paidAt,
          feeAmount: totalFee !== null ? String(totalFee) : null,
          netAmount: String(totalNet),
          ...(input.financialAccountId !== undefined && { financialAccountId: input.financialAccountId }),
          status,
          updatedAt: new Date(),
        })
        .where(eq(accountsReceivableTable.id, before.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "receive",
        entityType: "accounts_receivable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsReceivable(updated);
    });
  }

  async listReceivableSettlements(accountsReceivableId: string): Promise<ReceivableSettlement[]> {
    const rows = await this.db().select().from(paymentsTable).where(eq(paymentsTable.accountsReceivableId, accountsReceivableId));
    return rows.map(toPaymentReceivableSettlement);
  }

  async reverseReceivableSettlement(settlementId: string): Promise<AccountsReceivable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [settlement] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, settlementId)).limit(1);
      if (!settlement) throw new Error(`Recebimento não encontrado: ${settlementId}`);
      if (settlement.reversed) throw new Error("Este recebimento já foi estornado.");
      if (!settlement.accountsReceivableId) throw new Error("Este recebimento não pertence a uma conta a receber.");

      const [before] = await tx.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, settlement.accountsReceivableId)).limit(1);
      if (!before) throw new Error(`Conta a receber não encontrada: ${settlement.accountsReceivableId}`);

      await tx.update(paymentsTable).set({ reversed: true, reversedAt: new Date() }).where(eq(paymentsTable.id, settlementId));
      await tx.update(cashMovementsTable).set({ active: false }).where(eq(cashMovementsTable.paymentId, settlementId));

      const receivedAmount = Math.round((Number(before.receivedAmount) - Number(settlement.amount)) * 100) / 100;
      const outstandingAmount = computeOutstanding(Number(before.expectedAmount), receivedAmount);
      const settlementNet = settlement.netAmount !== null ? Number(settlement.netAmount) : null;
      const newNet = settlementNet !== null ? Math.round(((before.netAmount !== null ? Number(before.netAmount) : 0) - settlementNet) * 100) / 100 : (before.netAmount !== null ? Number(before.netAmount) : null);

      const [updated] = await tx
        .update(accountsReceivableTable)
        .set({
          receivedAmount: String(receivedAmount),
          outstandingAmount: String(outstandingAmount),
          netAmount: newNet !== null ? String(newNet) : null,
          /** "reversed" é status manual e distinto de voltar a "open"/"partially_paid". */
          status: "reversed",
          updatedAt: new Date(),
        })
        .where(eq(accountsReceivableTable.id, before.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "reverse_payment",
        entityType: "accounts_receivable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsReceivable(updated);
    });
  }

  async cancelAccountsReceivable(id: string): Promise<AccountsReceivable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, id)).limit(1);
      if (!before) throw new Error(`Conta a receber não encontrada: ${id}`);

      const [updated] = await tx
        .update(accountsReceivableTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(accountsReceivableTable.id, id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "cancel",
        entityType: "accounts_receivable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsReceivable(updated);
    });
  }

  async deleteAccountsReceivable(id: string): Promise<void> {
    const db = this.db();
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, id)).limit(1);
      if (!before) throw new Error(`Conta a receber não encontrada: ${id}`);

      const settlements = await tx.select().from(paymentsTable).where(eq(paymentsTable.accountsReceivableId, id));
      if (settlements.length > 0) {
        throw new Error("Exclusão definitiva só é permitida quando não houver recebimentos registrados. Use cancelar.");
      }

      await tx.delete(accountsReceivableTable).where(eq(accountsReceivableTable.id, id));

      await tx.insert(auditLogsTable).values({
        action: "delete",
        entityType: "accounts_receivable",
        entityId: id,
        beforeState: before,
        afterState: null,
        source: "manual",
      });
    });
  }

  private async toCashMovement(row: typeof cashMovementsTable.$inferSelect): Promise<CashMovement> {
    const db = this.db();
    let categoryName: string | null = null;
    if (row.categoryId) {
      const [cat] = await db.select().from(financialCategoriesTable).where(eq(financialCategoriesTable.id, row.categoryId)).limit(1);
      categoryName = cat?.name ?? null;
    }
    let costCenterName: string | null = null;
    if (row.costCenterId) {
      const [cc] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, row.costCenterId)).limit(1);
      costCenterName = cc?.name ?? null;
    }
    let financialAccountName: string | null = null;
    if (row.financialAccountId) {
      const [fa] = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, row.financialAccountId)).limit(1);
      financialAccountName = fa?.name ?? null;
    }
    const partyName = await this.resolveCashMovementPartyName(row.customerId, row.partnerId, row.supplierId);

    return {
      id: row.id,
      date: row.date,
      type: row.type as CashMovementType,
      nature: row.nature as CashMovementNature | null,
      amount: Number(row.amount),
      description: row.description,
      accountsReceivableId: row.accountsReceivableId,
      accountsPayableId: row.accountsPayableId,
      categoryId: row.categoryId,
      categoryName,
      costCenterId: row.costCenterId,
      costCenterName,
      financialAccountId: row.financialAccountId,
      financialAccountName,
      paymentId: row.paymentId,
      partnerId: row.partnerId,
      customerId: row.customerId,
      supplierId: row.supplierId,
      partyName,
      responsibleName: row.responsibleName,
      documentRef: row.documentRef,
      competenceDate: row.competenceDate,
      balanceBefore: row.balanceBefore !== null ? Number(row.balanceBefore) : null,
      balanceAfter: row.balanceAfter !== null ? Number(row.balanceAfter) : null,
      source: row.source,
      externalId: row.externalId,
      notes: row.notes,
    };
  }

  private async resolveCashMovementPartyName(
    customerId: string | null,
    partnerId: string | null,
    supplierId: string | null,
  ): Promise<string | null> {
    const db = this.db();
    if (partnerId) {
      const [row] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).limit(1);
      if (row) return row.name;
    }
    if (customerId) {
      const [row] = await db.select().from(customersTable).where(eq(customersTable.id, customerId)).limit(1);
      if (row?.name) return row.name;
    }
    if (supplierId) {
      const [row] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId)).limit(1);
      if (row?.name) return row.name;
    }
    return null;
  }

  async listCashMovements(): Promise<CashMovement[]> {
    const rows = await this.db().select().from(cashMovementsTable).where(eq(cashMovementsTable.active, true));
    const results: CashMovement[] = [];
    for (const row of rows) results.push(await this.toCashMovement(row));
    return results;
  }

  async listContracts(): Promise<Contract[]> {
    const db = this.db();
    const contractRows = await db.select().from(contractsTable).where(eq(contractsTable.active, true));

    const results: Contract[] = [];
    for (const row of contractRows) {
      const [partnerRow] = await db.select().from(partnersTable).where(eq(partnersTable.id, row.partnerId)).limit(1);
      const benefitRows = await db.select().from(contractBenefitsTable).where(eq(contractBenefitsTable.contractId, row.id));
      const periodRows = await db
        .select()
        .from(contractValuePeriodsTable)
        .where(eq(contractValuePeriodsTable.contractId, row.id));

      results.push({
        id: row.id,
        partnerId: row.partnerId,
        partnerName: partnerRow?.name ?? "Não informado",
        title: row.title,
        type: row.type as ContractType,
        status: row.status as ContractStatus,
        startDate: row.startDate,
        endDate: row.endDate,
        billingClosingDay: row.billingClosingDay,
        dueDay: row.dueDay,
        baseValue: row.baseValue !== null ? Number(row.baseValue) : null,
        notes: row.notes,
        valuePeriods: periodRows.map((p) => ({
          id: p.id,
          contractId: p.contractId,
          amount: Number(p.amount),
          effectiveFrom: p.effectiveFrom,
          effectiveUntil: p.effectiveUntil,
          notes: p.notes,
        })),
        benefits: benefitRows.map((b) => ({
          id: b.id,
          contractId: b.contractId,
          description: b.description,
          quantityPerPeriod: b.quantityPerPeriod,
          periodType: b.periodType,
          cumulative: b.cumulative,
        })),
      });
    }
    return results;
  }

  async listPartners(): Promise<Partner[]> {
    const rows = await this.db().select().from(partnersTable).where(eq(partnersTable.active, true));
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type as Partner["type"] }));
  }

  private async resolvePartyName(customerId: string | null, partnerId: string | null): Promise<string> {
    const db = this.db();
    if (partnerId) {
      const [row] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).limit(1);
      if (row) return row.name;
    }
    if (customerId) {
      const [row] = await db.select().from(customersTable).where(eq(customersTable.id, customerId)).limit(1);
      if (row?.name) return row.name;
    }
    return "Não informado";
  }

  // --- Fundação (fornecedores, contas financeiras, recorrências) ---

  async listSuppliers(): Promise<Supplier[]> {
    const rows = await this.db().select().from(suppliersTable).where(eq(suppliersTable.active, true));
    return rows.map(toSupplier);
  }

  async listFinancialCategories(type?: FinancialCategoryType): Promise<FinancialCategory[]> {
    const condition = type ? and(eq(financialCategoriesTable.active, true), eq(financialCategoriesTable.type, type)) : eq(financialCategoriesTable.active, true);
    const rows = await this.db().select().from(financialCategoriesTable).where(condition);
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type as FinancialCategoryType }));
  }

  async listCostCenters(): Promise<CostCenter[]> {
    const rows = await this.db().select().from(costCentersTable).where(eq(costCentersTable.active, true));
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  /** Saldo real ao vivo de uma conta — nunca lido de balanceBefore/After (só uma fotografia histórica). */
  private async getAccountCurrentBalance(accountId: string, fixedFundAmount: number | null): Promise<number> {
    const db = this.db();
    const movements = await db
      .select()
      .from(cashMovementsTable)
      .where(and(eq(cashMovementsTable.financialAccountId, accountId), eq(cashMovementsTable.active, true)));
    const transfersIn = await db
      .select()
      .from(accountTransfersTable)
      .where(and(eq(accountTransfersTable.toAccountId, accountId), eq(accountTransfersTable.active, true)));
    const transfersOut = await db
      .select()
      .from(accountTransfersTable)
      .where(and(eq(accountTransfersTable.fromAccountId, accountId), eq(accountTransfersTable.active, true)));

    return computeAccountBalance(
      fixedFundAmount,
      movements.map((m) => ({ type: m.type as CashMovementType, amount: Number(m.amount) })),
      transfersIn.map((t) => ({ amount: Number(t.amount) })),
      transfersOut.map((t) => ({ amount: Number(t.amount) })),
    );
  }

  async listFinancialAccounts(): Promise<FinancialAccountBalance[]> {
    const db = this.db();
    const accounts = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.active, true));

    const results: FinancialAccountBalance[] = [];
    for (const account of accounts) {
      const fixedFundAmount = account.fixedFundAmount !== null ? Number(account.fixedFundAmount) : null;
      const currentBalance = await this.getAccountCurrentBalance(account.id, fixedFundAmount);

      results.push({
        id: account.id,
        name: account.name,
        type: account.type as FinancialAccountType,
        fixedFundAmount,
        informedBalance: account.informedBalance !== null ? Number(account.informedBalance) : null,
        informedBalanceAt: account.informedBalanceAt ? account.informedBalanceAt.toISOString() : null,
        notes: account.notes,
        currentBalance,
        belowThreshold: fixedFundAmount !== null && currentBalance < fixedFundAmount,
      });
    }
    return results;
  }

  private async toAccountTransfer(row: typeof accountTransfersTable.$inferSelect): Promise<AccountTransfer> {
    const db = this.db();
    let fromAccountName: string | null = null;
    if (row.fromAccountId) {
      const [fa] = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, row.fromAccountId)).limit(1);
      fromAccountName = fa?.name ?? null;
    }
    let toAccountName: string | null = null;
    if (row.toAccountId) {
      const [ta] = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, row.toAccountId)).limit(1);
      toAccountName = ta?.name ?? null;
    }
    return {
      id: row.id,
      type: row.type as AccountTransferType,
      fromAccountId: row.fromAccountId,
      fromAccountName,
      toAccountId: row.toAccountId,
      toAccountName,
      amount: Number(row.amount),
      date: row.date,
      description: row.description,
      responsibleName: row.responsibleName,
      documentRef: row.documentRef,
      notes: row.notes,
    };
  }

  async recordAccountTransfer(input: RecordAccountTransferInput): Promise<AccountTransfer> {
    const [row] = await this.db()
      .insert(accountTransfersTable)
      .values({
        type: input.type,
        fromAccountId: input.fromAccountId ?? null,
        toAccountId: input.toAccountId ?? null,
        amount: String(input.amount),
        date: input.date,
        description: input.description,
        responsibleName: input.responsibleName ?? null,
        documentRef: input.documentRef ?? null,
        source: "manual",
        notes: input.notes ?? null,
      })
      .returning();
    return this.toAccountTransfer(row);
  }

  async listAccountTransfers(): Promise<AccountTransfer[]> {
    const rows = await this.db().select().from(accountTransfersTable).where(eq(accountTransfersTable.active, true));
    const results: AccountTransfer[] = [];
    for (const row of rows) results.push(await this.toAccountTransfer(row));
    return results;
  }

  async createCashMovement(input: CreateCashMovementInput): Promise<CashMovement> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [account] = await tx.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, input.financialAccountId)).limit(1);
      if (!account) throw new Error(`Conta financeira não encontrada: ${input.financialAccountId}`);

      const fixedFundAmount = account.fixedFundAmount !== null ? Number(account.fixedFundAmount) : null;
      const balanceBefore = await this.getAccountCurrentBalance(input.financialAccountId, fixedFundAmount);
      const balanceAfter =
        Math.round((balanceBefore + (input.type === "entrada" ? input.amount : -input.amount)) * 100) / 100;

      const [row] = await tx
        .insert(cashMovementsTable)
        .values({
          date: input.date,
          type: input.type,
          nature: input.nature ?? null,
          amount: String(input.amount),
          description: input.description,
          categoryId: input.categoryId ?? null,
          costCenterId: input.costCenterId ?? null,
          financialAccountId: input.financialAccountId,
          partnerId: input.partnerId ?? null,
          customerId: input.customerId ?? null,
          supplierId: input.supplierId ?? null,
          responsibleName: input.responsibleName ?? null,
          documentRef: input.documentRef ?? null,
          competenceDate: input.competenceDate ?? null,
          balanceBefore: String(balanceBefore),
          balanceAfter: String(balanceAfter),
          source: "manual",
          notes: input.notes ?? null,
        })
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "create",
        entityType: "cash_movement",
        entityId: row.id,
        beforeState: null,
        afterState: row,
        source: "manual",
      });

      return this.toCashMovement(row);
    });
  }

  async informAccountBalance(input: InformAccountBalanceInput): Promise<FinancialAccountBalance> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, input.financialAccountId)).limit(1);
      if (!before) throw new Error(`Conta financeira não encontrada: ${input.financialAccountId}`);

      const [updated] = await tx
        .update(financialAccountsTable)
        .set({ informedBalance: String(input.informedBalance), informedBalanceAt: new Date(), updatedAt: new Date() })
        .where(eq(financialAccountsTable.id, input.financialAccountId))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "inform_balance",
        entityType: "financial_account",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      const fixedFundAmount = updated.fixedFundAmount !== null ? Number(updated.fixedFundAmount) : null;
      const currentBalance = await this.getAccountCurrentBalance(updated.id, fixedFundAmount);

      return {
        id: updated.id,
        name: updated.name,
        type: updated.type as FinancialAccountType,
        fixedFundAmount,
        informedBalance: updated.informedBalance !== null ? Number(updated.informedBalance) : null,
        informedBalanceAt: updated.informedBalanceAt ? updated.informedBalanceAt.toISOString() : null,
        notes: updated.notes,
        currentBalance,
        belowThreshold: fixedFundAmount !== null && currentBalance < fixedFundAmount,
      };
    });
  }

  async listRecurringBillTemplates(): Promise<RecurringBillTemplate[]> {
    const db = this.db();
    const rows = await db.select().from(recurringBillTemplatesTable).where(eq(recurringBillTemplatesTable.active, true));

    const results: RecurringBillTemplate[] = [];
    for (const row of rows) {
      let supplierName: string | null = null;
      if (row.supplierId) {
        const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, row.supplierId)).limit(1);
        supplierName = supplier?.name ?? null;
      }
      results.push({
        id: row.id,
        description: row.description,
        supplierId: row.supplierId,
        supplierName,
        categoryId: row.categoryId,
        costCenterId: row.costCenterId,
        financialAccountId: row.financialAccountId,
        amount: row.amount !== null ? Number(row.amount) : null,
        variableAmount: row.variableAmount,
        dueDay: row.dueDay,
        periodicity: row.periodicity,
        pendingData: row.pendingData,
        notes: row.notes,
      });
    }
    return results;
  }

  // --- Contas a Pagar ---

  private async toAccountsPayable(row: typeof accountsPayableTable.$inferSelect): Promise<AccountsPayable> {
    const db = this.db();
    let supplierName: string | null = null;
    if (row.supplierId) {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, row.supplierId)).limit(1);
      supplierName = s?.name ?? null;
    }
    const [category] = await db.select().from(financialCategoriesTable).where(eq(financialCategoriesTable.id, row.categoryId)).limit(1);
    let costCenterName: string | null = null;
    if (row.costCenterId) {
      const [cc] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, row.costCenterId)).limit(1);
      costCenterName = cc?.name ?? null;
    }
    let financialAccountName: string | null = null;
    if (row.financialAccountId) {
      const [fa] = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.id, row.financialAccountId)).limit(1);
      financialAccountName = fa?.name ?? null;
    }

    return {
      id: row.id,
      description: row.description,
      supplierId: row.supplierId,
      supplierName,
      categoryId: row.categoryId,
      categoryName: category?.name ?? "Não informado",
      costCenterId: row.costCenterId,
      costCenterName,
      financialAccountId: row.financialAccountId,
      financialAccountName,
      competenceDate: row.competenceDate,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      originalAmount: Number(row.originalAmount),
      paidAmount: Number(row.paidAmount),
      outstandingAmount: Number(row.outstandingAmount),
      paymentMethod: row.paymentMethod as FinancePaymentMethod,
      documentNumber: row.documentNumber,
      status: row.status as AccountsPayableStatus,
      pendingData: row.pendingData,
      recurringBillTemplateId: row.recurringBillTemplateId,
      installmentGroupId: row.installmentGroupId,
      installmentNumber: row.installmentNumber,
      installmentTotal: row.installmentTotal,
      attachmentRef: row.attachmentRef,
      source: row.source,
      externalId: row.externalId,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listAccountsPayable(): Promise<AccountsPayable[]> {
    const rows = await this.db().select().from(accountsPayableTable).where(eq(accountsPayableTable.active, true));
    const results: AccountsPayable[] = [];
    for (const row of rows) results.push(await this.toAccountsPayable(row));
    return results;
  }

  async getAccountsPayable(id: string): Promise<AccountsPayable | null> {
    const rows = await this.db().select().from(accountsPayableTable).where(eq(accountsPayableTable.id, id)).limit(1);
    if (!rows[0]) return null;
    return this.toAccountsPayable(rows[0]);
  }

  async createAccountsPayable(input: CreateAccountsPayableInput): Promise<AccountsPayable[]> {
    const db = this.db();
    const installmentTotal = input.installmentTotal && input.installmentTotal > 1 ? input.installmentTotal : 1;
    const installments = computeInstallments(input.originalAmount, installmentTotal, input.dueDate);
    const installmentGroupId = installmentTotal > 1 ? crypto.randomUUID() : null;

    return db.transaction(async (tx) => {
      const created: AccountsPayable[] = [];
      for (const installment of installments) {
        const [row] = await tx
          .insert(accountsPayableTable)
          .values({
            description: installmentTotal > 1 ? `${input.description} (${installment.number}/${installmentTotal})` : input.description,
            supplierId: input.supplierId ?? null,
            categoryId: input.categoryId,
            costCenterId: input.costCenterId ?? null,
            financialAccountId: input.financialAccountId ?? null,
            competenceDate: input.competenceDate,
            issueDate: input.issueDate ?? null,
            dueDate: installment.dueDate,
            originalAmount: String(installment.amount),
            paidAmount: "0",
            outstandingAmount: String(installment.amount),
            paymentMethod: input.paymentMethod ?? "desconhecido",
            documentNumber: input.documentNumber ?? null,
            status: input.status ?? "pendente",
            pendingData: input.pendingData ?? false,
            installmentGroupId,
            installmentNumber: installmentTotal > 1 ? installment.number : null,
            installmentTotal: installmentTotal > 1 ? installmentTotal : null,
            recurringBillTemplateId: input.recurringBillTemplateId ?? null,
            source: input.recurringBillTemplateId ? "recorrencia" : "manual",
            notes: input.notes ?? null,
          })
          .returning();

        await tx.insert(auditLogsTable).values({
          action: "create",
          entityType: "accounts_payable",
          entityId: row.id,
          beforeState: null,
          afterState: row,
          source: "manual",
        });

        created.push(await this.toAccountsPayable(row));
      }
      return created;
    });
  }

  async updateAccountsPayable(input: UpdateAccountsPayableInput): Promise<AccountsPayable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, input.id)).limit(1);
      if (!before) throw new Error(`Conta a pagar não encontrada: ${input.id}`);

      const newOriginalAmount = input.originalAmount !== undefined ? input.originalAmount : Number(before.originalAmount);
      const outstandingAmount = computeOutstanding(newOriginalAmount, Number(before.paidAmount));

      const [updated] = await tx
        .update(accountsPayableTable)
        .set({
          ...(input.description !== undefined && { description: input.description }),
          ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
          ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
          ...(input.costCenterId !== undefined && { costCenterId: input.costCenterId }),
          ...(input.financialAccountId !== undefined && { financialAccountId: input.financialAccountId }),
          ...(input.competenceDate !== undefined && { competenceDate: input.competenceDate }),
          ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.originalAmount !== undefined && { originalAmount: String(input.originalAmount), outstandingAmount: String(outstandingAmount) }),
          ...(input.paymentMethod !== undefined && { paymentMethod: input.paymentMethod }),
          ...(input.documentNumber !== undefined && { documentNumber: input.documentNumber }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.pendingData !== undefined && { pendingData: input.pendingData }),
          updatedAt: new Date(),
        })
        .where(eq(accountsPayableTable.id, input.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "update",
        entityType: "accounts_payable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsPayable(updated);
    });
  }

  async recordPayablePayment(input: RecordPayablePaymentInput): Promise<AccountsPayable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, input.accountsPayableId)).limit(1);
      if (!before) throw new Error(`Conta a pagar não encontrada: ${input.accountsPayableId}`);

      const outstandingAmount = Number(before.outstandingAmount);
      if (input.amount > outstandingAmount && !input.allowOverpayment) {
        throw new PayableOverpaymentError(outstandingAmount, input.amount);
      }

      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          accountsPayableId: before.id,
          financialAccountId: input.financialAccountId ?? null,
          amount: String(input.amount),
          paidAt: input.paidAt,
          method: input.method,
          source: "manual",
          notes: input.notes ?? null,
        })
        .returning();

      // Movimento de caixa real, para que o saldo da conta (e o alerta de fundo mínimo) reflita
      // o pagamento — só quando a conta de pagamento foi informada.
      if (input.financialAccountId) {
        await tx.insert(cashMovementsTable).values({
          date: input.paidAt,
          type: "saida",
          amount: String(input.amount),
          description: `Pagamento: ${before.description}`,
          categoryId: before.categoryId,
          costCenterId: before.costCenterId,
          financialAccountId: input.financialAccountId,
          paymentId: payment.id,
          source: "manual",
        });
      }

      const paidAmount = Number(before.paidAmount) + input.amount;
      const newOutstanding = computeOutstanding(Number(before.originalAmount), paidAmount);
      const status = computeAccountsPayableStatus(
        { status: before.status as AccountsPayableStatus, outstandingAmount: newOutstanding, paidAmount, dueDate: before.dueDate },
        input.paidAt,
      );

      const [updated] = await tx
        .update(accountsPayableTable)
        .set({
          paidAmount: String(paidAmount),
          outstandingAmount: String(newOutstanding),
          paymentMethod: input.method,
          ...(input.financialAccountId !== undefined && { financialAccountId: input.financialAccountId }),
          status,
          updatedAt: new Date(),
        })
        .where(eq(accountsPayableTable.id, before.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "pay",
        entityType: "accounts_payable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsPayable(updated);
    });
  }

  async listPayableSettlements(accountsPayableId: string): Promise<PayableSettlement[]> {
    const rows = await this.db().select().from(paymentsTable).where(eq(paymentsTable.accountsPayableId, accountsPayableId));
    return rows.map(toPayableSettlement);
  }

  async reversePayableSettlement(settlementId: string): Promise<AccountsPayable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [settlement] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, settlementId)).limit(1);
      if (!settlement) throw new Error(`Baixa não encontrada: ${settlementId}`);
      if (settlement.reversed) throw new Error("Esta baixa já foi estornada.");
      if (!settlement.accountsPayableId) throw new Error("Esta baixa não pertence a uma conta a pagar.");

      const [before] = await tx.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, settlement.accountsPayableId)).limit(1);
      if (!before) throw new Error(`Conta a pagar não encontrada: ${settlement.accountsPayableId}`);

      await tx.update(paymentsTable).set({ reversed: true, reversedAt: new Date() }).where(eq(paymentsTable.id, settlementId));
      // Desativa o movimento de caixa correspondente, removendo-o do cálculo de saldo.
      await tx.update(cashMovementsTable).set({ active: false }).where(eq(cashMovementsTable.paymentId, settlementId));

      const paidAmount = Math.round((Number(before.paidAmount) - Number(settlement.amount)) * 100) / 100;
      const outstandingAmount = computeOutstanding(Number(before.originalAmount), paidAmount);
      const asOfDate = new Date().toISOString().slice(0, 10);
      const status = computeAccountsPayableStatus(
        { status: before.status as AccountsPayableStatus, outstandingAmount, paidAmount, dueDate: before.dueDate },
        asOfDate,
      );

      const [updated] = await tx
        .update(accountsPayableTable)
        .set({ paidAmount: String(paidAmount), outstandingAmount: String(outstandingAmount), status, updatedAt: new Date() })
        .where(eq(accountsPayableTable.id, before.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "reverse_payment",
        entityType: "accounts_payable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsPayable(updated);
    });
  }

  async cancelAccountsPayable(id: string): Promise<AccountsPayable> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, id)).limit(1);
      if (!before) throw new Error(`Conta a pagar não encontrada: ${id}`);

      const [updated] = await tx
        .update(accountsPayableTable)
        .set({ status: "cancelada", updatedAt: new Date() })
        .where(eq(accountsPayableTable.id, id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "cancel",
        entityType: "accounts_payable",
        entityId: updated.id,
        beforeState: before,
        afterState: updated,
        source: "manual",
      });

      return this.toAccountsPayable(updated);
    });
  }

  async deleteAccountsPayable(id: string): Promise<void> {
    const db = this.db();
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, id)).limit(1);
      if (!before) throw new Error(`Conta a pagar não encontrada: ${id}`);

      const settlements = await tx.select().from(paymentsTable).where(eq(paymentsTable.accountsPayableId, id));
      if (settlements.length > 0) {
        throw new Error("Exclusão definitiva só é permitida quando não houver pagamentos registrados. Use cancelar.");
      }

      await tx.delete(accountsPayableTable).where(eq(accountsPayableTable.id, id));

      await tx.insert(auditLogsTable).values({
        action: "delete",
        entityType: "accounts_payable",
        entityId: id,
        beforeState: before,
        afterState: null,
        source: "manual",
      });
    });
  }

  async listAuditLog(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    const rows = await this.db()
      .select()
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.entityType, entityType), eq(auditLogsTable.entityId, entityId)));
    return rows.map(toAuditLogEntry);
  }

  // --- Contabilidade Gerencial ---

  async listFinancialClassifications(): Promise<FinancialClassification[]> {
    const rows = await this.db().select().from(financialClassificationsTable).where(eq(financialClassificationsTable.active, true));
    return rows.map(toFinancialClassification);
  }

  async classifyEntity(input: ClassifyEntityInput): Promise<FinancialClassification> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const column = classificationColumnFor(input.sourceKind);
      const [existing] = await tx.select().from(financialClassificationsTable).where(eq(column, input.sourceId)).limit(1);

      const values = {
        accountsPayableId: input.sourceKind === "accounts_payable" ? input.sourceId : null,
        accountsReceivableId: input.sourceKind === "accounts_receivable" ? input.sourceId : null,
        cashMovementId: input.sourceKind === "cash_movement" ? input.sourceId : null,
        accountTransferId: input.sourceKind === "account_transfer" ? input.sourceId : null,
        dreLine: input.dreLine,
        nature: input.nature,
        includeInDre: input.includeInDre ?? true,
        origin: "manual" as ClassificationOrigin,
        reviewNeeded: input.reviewNeeded ?? false,
        classifiedBy: input.classifiedBy ?? null,
        source: "manual",
        notes: input.notes ?? null,
        updatedAt: new Date(),
      };

      const row = existing
        ? (await tx.update(financialClassificationsTable).set(values).where(eq(financialClassificationsTable.id, existing.id)).returning())[0]
        : (await tx.insert(financialClassificationsTable).values(values).returning())[0];

      await tx.insert(auditLogsTable).values({
        action: existing ? "update" : "create",
        entityType: "financial_classification",
        entityId: row.id,
        beforeState: existing ?? null,
        afterState: row,
        source: "manual",
      });

      if (input.createRule) {
        await tx
          .insert(classificationRulesTable)
          .values({
            matchType: input.createRule.matchType,
            supplierId: input.createRule.supplierId ?? null,
            partnerId: input.createRule.partnerId ?? null,
            categoryId: input.createRule.categoryId ?? null,
            keyword: input.createRule.keyword ?? null,
            dreLine: input.dreLine,
            nature: input.nature,
            includeInDre: input.includeInDre ?? true,
            reviewNeeded: input.reviewNeeded ?? false,
            source: "manual",
          })
          .onConflictDoNothing();
      }

      return toFinancialClassification(row);
    });
  }

  async listClassificationRules(): Promise<ClassificationRule[]> {
    const db = this.db();
    const rows = await db.select().from(classificationRulesTable).where(eq(classificationRulesTable.active, true));
    const results: ClassificationRule[] = [];
    for (const row of rows) results.push(await this.toClassificationRule(row));
    return results;
  }

  private async toClassificationRule(row: typeof classificationRulesTable.$inferSelect): Promise<ClassificationRule> {
    const db = this.db();
    let supplierName: string | null = null;
    if (row.supplierId) {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, row.supplierId)).limit(1);
      supplierName = s?.name ?? null;
    }
    let partnerName: string | null = null;
    if (row.partnerId) {
      const [p] = await db.select().from(partnersTable).where(eq(partnersTable.id, row.partnerId)).limit(1);
      partnerName = p?.name ?? null;
    }
    let categoryName: string | null = null;
    if (row.categoryId) {
      const [c] = await db.select().from(financialCategoriesTable).where(eq(financialCategoriesTable.id, row.categoryId)).limit(1);
      categoryName = c?.name ?? null;
    }
    let suggestedCostCenterName: string | null = null;
    if (row.suggestedCostCenterId) {
      const [cc] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, row.suggestedCostCenterId)).limit(1);
      suggestedCostCenterName = cc?.name ?? null;
    }
    return {
      id: row.id,
      matchType: row.matchType as ClassificationMatchType,
      supplierId: row.supplierId,
      supplierName,
      partnerId: row.partnerId,
      partnerName,
      categoryId: row.categoryId,
      categoryName,
      keyword: row.keyword,
      dreLine: row.dreLine as DreLine,
      nature: row.nature as FinancialNature,
      suggestedCostCenterId: row.suggestedCostCenterId,
      suggestedCostCenterName,
      includeInDre: row.includeInDre,
      reviewNeeded: row.reviewNeeded,
      enabled: row.enabled,
      notes: row.notes,
    };
  }

  async createClassificationRule(input: CreateClassificationRuleInput): Promise<ClassificationRule> {
    const [row] = await this.db()
      .insert(classificationRulesTable)
      .values({
        matchType: input.matchType,
        supplierId: input.supplierId ?? null,
        partnerId: input.partnerId ?? null,
        categoryId: input.categoryId ?? null,
        keyword: input.keyword ?? null,
        dreLine: input.dreLine,
        nature: input.nature,
        suggestedCostCenterId: input.suggestedCostCenterId ?? null,
        includeInDre: input.includeInDre ?? true,
        reviewNeeded: input.reviewNeeded ?? false,
        enabled: input.enabled ?? true,
        source: "manual",
        notes: input.notes ?? null,
      })
      .returning();

    await this.db().insert(auditLogsTable).values({
      action: "create",
      entityType: "classification_rule",
      entityId: row.id,
      beforeState: null,
      afterState: row,
      source: "manual",
    });

    return this.toClassificationRule(row);
  }

  async deleteClassificationRule(id: string): Promise<void> {
    const db = this.db();
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(classificationRulesTable).where(eq(classificationRulesTable.id, id)).limit(1);
      if (!before) throw new Error(`Regra de classificação não encontrada: ${id}`);
      await tx.update(classificationRulesTable).set({ active: false, enabled: false, updatedAt: new Date() }).where(eq(classificationRulesTable.id, id));
      await tx.insert(auditLogsTable).values({
        action: "delete",
        entityType: "classification_rule",
        entityId: id,
        beforeState: before,
        afterState: null,
        source: "manual",
      });
    });
  }

  async listAllocationRules(): Promise<AllocationRule[]> {
    const db = this.db();
    const rules = await db.select().from(allocationRulesTable).where(eq(allocationRulesTable.active, true));
    const results: AllocationRule[] = [];
    for (const rule of rules) {
      const shares = await db.select().from(allocationRuleSharesTable).where(eq(allocationRuleSharesTable.allocationRuleId, rule.id));
      const sharesWithNames = [];
      for (const share of shares) {
        const [cc] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, share.costCenterId)).limit(1);
        sharesWithNames.push({ costCenterId: share.costCenterId, costCenterName: cc?.name ?? "Não informado", percentage: Number(share.percentage) });
      }
      results.push({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        effectiveFrom: rule.effectiveFrom,
        effectiveUntil: rule.effectiveUntil,
        shares: sharesWithNames,
        notes: rule.notes,
      });
    }
    return results;
  }

  async createAllocationRule(input: CreateAllocationRuleInput): Promise<AllocationRule> {
    const total = Math.round(input.shares.reduce((sum, s) => sum + s.percentage, 0) * 100) / 100;
    if (total !== 100) {
      throw new Error(`A soma dos percentuais do rateio deve ser exatamente 100% (atual: ${total}%).`);
    }

    const db = this.db();
    return db.transaction(async (tx) => {
      const [rule] = await tx
        .insert(allocationRulesTable)
        .values({
          name: input.name,
          description: input.description ?? null,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil ?? null,
          source: "manual",
          notes: input.notes ?? null,
        })
        .returning();

      const shares = [];
      for (const share of input.shares) {
        const [shareRow] = await tx
          .insert(allocationRuleSharesTable)
          .values({ allocationRuleId: rule.id, costCenterId: share.costCenterId, percentage: String(share.percentage) })
          .returning();
        const [cc] = await tx.select().from(costCentersTable).where(eq(costCentersTable.id, share.costCenterId)).limit(1);
        shares.push({ costCenterId: shareRow.costCenterId, costCenterName: cc?.name ?? "Não informado", percentage: Number(shareRow.percentage) });
      }

      await tx.insert(auditLogsTable).values({
        action: "create",
        entityType: "allocation_rule",
        entityId: rule.id,
        beforeState: null,
        afterState: { ...rule, shares },
        source: "manual",
      });

      return { id: rule.id, name: rule.name, description: rule.description, effectiveFrom: rule.effectiveFrom, effectiveUntil: rule.effectiveUntil, shares, notes: rule.notes };
    });
  }

  private toAccountingPeriod(row: typeof accountingPeriodsTable.$inferSelect): AccountingPeriod {
    return {
      id: row.id,
      competenceMonth: row.competenceMonth,
      status: row.status as AccountingPeriodStatus,
      closedBy: row.closedBy,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      reopenedBy: row.reopenedBy,
      reopenedAt: row.reopenedAt ? row.reopenedAt.toISOString() : null,
      reopenJustification: row.reopenJustification,
      notes: row.notes,
    };
  }

  async listAccountingPeriods(): Promise<AccountingPeriod[]> {
    const rows = await this.db().select().from(accountingPeriodsTable).where(eq(accountingPeriodsTable.active, true));
    return rows.map((r) => this.toAccountingPeriod(r));
  }

  async getAccountingPeriod(competenceMonth: string): Promise<AccountingPeriod | null> {
    const rows = await this.db().select().from(accountingPeriodsTable).where(eq(accountingPeriodsTable.competenceMonth, competenceMonth)).limit(1);
    return rows[0] ? this.toAccountingPeriod(rows[0]) : null;
  }

  async closeAccountingPeriod(input: CloseAccountingPeriodInput): Promise<AccountingPeriod> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(accountingPeriodsTable).where(eq(accountingPeriodsTable.competenceMonth, input.competenceMonth)).limit(1);
      if (existing?.status === "fechado") throw new Error(`Competência ${input.competenceMonth} já está fechada.`);

      const values = {
        competenceMonth: input.competenceMonth,
        status: "fechado" as const,
        closedBy: input.closedBy,
        closedAt: new Date(),
        source: "manual",
        notes: input.notes ?? null,
        updatedAt: new Date(),
      };

      const row = existing
        ? (await tx.update(accountingPeriodsTable).set(values).where(eq(accountingPeriodsTable.id, existing.id)).returning())[0]
        : (await tx.insert(accountingPeriodsTable).values(values).returning())[0];

      await tx.insert(auditLogsTable).values({
        action: "close",
        entityType: "accounting_period",
        entityId: row.id,
        beforeState: existing ?? null,
        afterState: row,
        source: "manual",
      });

      return this.toAccountingPeriod(row);
    });
  }

  async reopenAccountingPeriod(input: ReopenAccountingPeriodInput): Promise<AccountingPeriod> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(accountingPeriodsTable).where(eq(accountingPeriodsTable.competenceMonth, input.competenceMonth)).limit(1);
      if (!existing) throw new Error(`Competência ${input.competenceMonth} nunca foi fechada.`);
      if (existing.status !== "fechado") throw new Error(`Competência ${input.competenceMonth} não está fechada.`);
      if (!input.reopenJustification.trim()) throw new Error("Justificativa obrigatória para reabrir uma competência.");

      const [row] = await tx
        .update(accountingPeriodsTable)
        .set({
          status: "reaberto",
          reopenedBy: input.reopenedBy,
          reopenedAt: new Date(),
          reopenJustification: input.reopenJustification,
          updatedAt: new Date(),
        })
        .where(eq(accountingPeriodsTable.id, existing.id))
        .returning();

      await tx.insert(auditLogsTable).values({
        action: "reopen",
        entityType: "accounting_period",
        entityId: row.id,
        beforeState: existing,
        afterState: row,
        source: "manual",
      });

      return this.toAccountingPeriod(row);
    });
  }
}

function classificationColumnFor(sourceKind: ClassifyEntityInput["sourceKind"]) {
  switch (sourceKind) {
    case "accounts_payable":
      return financialClassificationsTable.accountsPayableId;
    case "accounts_receivable":
      return financialClassificationsTable.accountsReceivableId;
    case "cash_movement":
      return financialClassificationsTable.cashMovementId;
    case "account_transfer":
      return financialClassificationsTable.accountTransferId;
  }
}

function toFinancialClassification(row: typeof financialClassificationsTable.$inferSelect): FinancialClassification {
  return {
    id: row.id,
    accountsPayableId: row.accountsPayableId,
    accountsReceivableId: row.accountsReceivableId,
    cashMovementId: row.cashMovementId,
    accountTransferId: row.accountTransferId,
    dreLine: row.dreLine as DreLine,
    nature: row.nature as FinancialNature,
    includeInDre: row.includeInDre,
    origin: row.origin as ClassificationOrigin,
    reviewNeeded: row.reviewNeeded,
    classifiedBy: row.classifiedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
