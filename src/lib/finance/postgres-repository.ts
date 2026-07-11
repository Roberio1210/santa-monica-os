import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accountsReceivable as accountsReceivableTable,
  cashMovements as cashMovementsTable,
  contractBenefits as contractBenefitsTable,
  contractValuePeriods as contractValuePeriodsTable,
  contracts as contractsTable,
  customers as customersTable,
  partners as partnersTable,
} from "@/db/schema";
import type { FinanceRepository } from "@/lib/finance/repository";
import type {
  AccountsReceivable,
  AccountsReceivableStatus,
  CashMovement,
  CashMovementType,
  Contract,
  ContractStatus,
  ContractType,
  FinancePaymentMethod,
  RecordPaymentInput,
} from "@/lib/finance/types";
import { computeAccountsReceivableStatus, computeOutstanding } from "@/lib/finance/status";

function toAccountsReceivable(
  row: typeof accountsReceivableTable.$inferSelect,
  partyName: string,
): AccountsReceivable {
  return {
    id: row.id,
    customerId: row.customerId,
    partnerId: row.partnerId,
    contractId: row.contractId,
    partyName,
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
    source: row.source,
    externalId: row.externalId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
    source: row.source,
    externalId: row.externalId,
    notes: row.notes,
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

  async listAccountsReceivable(): Promise<AccountsReceivable[]> {
    const db = this.db();
    const rows = await db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.active, true));

    const results: AccountsReceivable[] = [];
    for (const row of rows) {
      const partyName = await this.resolvePartyName(row.customerId, row.partnerId);
      results.push(toAccountsReceivable(row, partyName));
    }
    return results;
  }

  async getAccountsReceivable(id: string): Promise<AccountsReceivable | null> {
    const db = this.db();
    const rows = await db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    const partyName = await this.resolvePartyName(row.customerId, row.partnerId);
    return toAccountsReceivable(row, partyName);
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

      const partyName = await this.resolvePartyName(updated.customerId, updated.partnerId);
      return toAccountsReceivable(updated, partyName);
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
}
