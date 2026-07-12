import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accountsPayable as accountsPayableTable,
  accountsReceivable as accountsReceivableTable,
  accountTransfers as accountTransfersTable,
  auditLogs as auditLogsTable,
  cashMovements as cashMovementsTable,
  contractBenefits as contractBenefitsTable,
  contractValuePeriods as contractValuePeriodsTable,
  contracts as contractsTable,
  customers as customersTable,
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
  AccountsPayable,
  AccountsPayableStatus,
  AccountsReceivable,
  AccountsReceivableStatus,
  AccountTransfer,
  AccountTransferType,
  AuditLogEntry,
  CashMovement,
  CashMovementType,
  Contract,
  ContractStatus,
  ContractType,
  CostCenter,
  CreateAccountsPayableInput,
  CreateAccountsReceivableInput,
  FinancePaymentMethod,
  FinancialAccountBalance,
  FinancialAccountType,
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

function toCashMovement(row: typeof cashMovementsTable.$inferSelect): CashMovement {
  return {
    id: row.id,
    date: row.date,
    type: row.type as CashMovementType,
    amount: Number(row.amount),
    description: row.description,
    accountsReceivableId: row.accountsReceivableId,
    categoryId: row.categoryId,
    costCenterId: row.costCenterId,
    financialAccountId: row.financialAccountId,
    paymentId: row.paymentId,
    source: row.source,
    externalId: row.externalId,
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

function toAccountTransfer(row: typeof accountTransfersTable.$inferSelect): AccountTransfer {
  return {
    id: row.id,
    type: row.type as AccountTransferType,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amount: Number(row.amount),
    date: row.date,
    description: row.description,
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

  async listCashMovements(): Promise<CashMovement[]> {
    const rows = await this.db().select().from(cashMovementsTable).where(eq(cashMovementsTable.active, true));
    return rows.map(toCashMovement);
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

  async listFinancialAccounts(): Promise<FinancialAccountBalance[]> {
    const db = this.db();
    const accounts = await db.select().from(financialAccountsTable).where(eq(financialAccountsTable.active, true));

    const results: FinancialAccountBalance[] = [];
    for (const account of accounts) {
      const movements = await db
        .select()
        .from(cashMovementsTable)
        .where(and(eq(cashMovementsTable.financialAccountId, account.id), eq(cashMovementsTable.active, true)));
      const transfersIn = await db
        .select()
        .from(accountTransfersTable)
        .where(and(eq(accountTransfersTable.toAccountId, account.id), eq(accountTransfersTable.active, true)));
      const transfersOut = await db
        .select()
        .from(accountTransfersTable)
        .where(and(eq(accountTransfersTable.fromAccountId, account.id), eq(accountTransfersTable.active, true)));

      const fixedFundAmount = account.fixedFundAmount !== null ? Number(account.fixedFundAmount) : null;
      const currentBalance = computeAccountBalance(
        fixedFundAmount,
        movements.map((m) => ({ type: m.type as CashMovementType, amount: Number(m.amount) })),
        transfersIn.map((t) => ({ amount: Number(t.amount) })),
        transfersOut.map((t) => ({ amount: Number(t.amount) })),
      );

      results.push({
        id: account.id,
        name: account.name,
        type: account.type as FinancialAccountType,
        fixedFundAmount,
        notes: account.notes,
        currentBalance,
        belowThreshold: fixedFundAmount !== null && currentBalance < fixedFundAmount,
      });
    }
    return results;
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
        source: "manual",
        notes: input.notes ?? null,
      })
      .returning();
    return toAccountTransfer(row);
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
}
