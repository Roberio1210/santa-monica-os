import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bankStatementClassificationRules as rulesTable, bankStatementImports as importsTable, bankStatementLines as linesTable } from "@/db/schema/bankStatement";
import type { BankStatementRepository, CreateImportWithLinesInput, UpdateBankStatementLineInput } from "@/lib/finance/bankStatement/repository";
import type { BankStatementClassificationRule, BankStatementImport, BankStatementLine, CreateBankStatementClassificationRuleInput } from "@/lib/finance/bankStatement/types";

function toRule(row: typeof rulesTable.$inferSelect): BankStatementClassificationRule {
  return {
    id: row.id,
    criteriaDirection: row.criteriaDirection,
    criteriaCounterpartyPattern: row.criteriaCounterpartyPattern,
    criteriaDescriptionKeyword: row.criteriaDescriptionKeyword,
    resultingType: row.resultingType,
    categoryId: row.categoryId,
    supplierId: row.supplierId,
    partnerId: row.partnerId,
    appliedCount: row.appliedCount,
    createdBy: row.createdBy,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function toImport(row: typeof importsTable.$inferSelect): BankStatementImport {
  return {
    id: row.id,
    financialAccountId: row.financialAccountId,
    fileFormat: row.fileFormat,
    filename: row.filename,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    importedBy: row.importedBy,
    status: row.status,
    rowCount: row.rowCount,
    newRowCount: row.newRowCount,
    duplicateRowCount: row.duplicateRowCount,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLine(row: typeof linesTable.$inferSelect): BankStatementLine {
  return {
    id: row.id,
    importId: row.importId,
    rowIndex: row.rowIndex,
    rawData: row.rawData as Record<string, unknown>,
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    direction: row.direction,
    amount: Number(row.amount),
    type: row.type,
    status: row.status,
    categoryId: row.categoryId,
    supplierId: row.supplierId,
    partnerId: row.partnerId,
    matchedStoneAmount: row.matchedStoneAmount !== null ? Number(row.matchedStoneAmount) : null,
    matchedStoneDivergence: row.matchedStoneDivergence !== null ? Number(row.matchedStoneDivergence) : null,
    linkedAccountsReceivableId: row.linkedAccountsReceivableId,
    linkedAccountsPayableId: row.linkedAccountsPayableId,
    linkedCashMovementId: row.linkedCashMovementId,
    linkedAccountTransferId: row.linkedAccountTransferId,
    reconciliationNote: row.reconciliationNote,
    processedBy: row.processedBy,
    dedupeKey: row.dedupeKey,
  };
}

export class BankStatementPostgresRepository implements BankStatementRepository {
  private db() {
    const db = getDb();
    if (!db) throw new Error("Banco de dados não configurado (DATABASE_URL ausente).");
    return db;
  }

  async listExistingDedupeKeys(financialAccountId: string): Promise<Set<string>> {
    const rows = await this.db()
      .select({ dedupeKey: linesTable.dedupeKey })
      .from(linesTable)
      .innerJoin(importsTable, eq(importsTable.id, linesTable.importId))
      .where(eq(importsTable.financialAccountId, financialAccountId));
    return new Set(rows.map((r) => r.dedupeKey));
  }

  async createImportWithLines(input: CreateImportWithLinesInput): Promise<BankStatementImport> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [importRow] = await tx
        .insert(importsTable)
        .values({
          financialAccountId: input.financialAccountId,
          fileFormat: input.fileFormat,
          filename: input.filename,
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          importedBy: input.importedBy,
          status: "processado",
          rowCount: input.totalRowCount,
          newRowCount: input.newLines.length,
          duplicateRowCount: input.duplicateRowCount,
        })
        .returning();

      if (input.newLines.length > 0) {
        await tx.insert(linesTable).values(
          input.newLines.map((line) => ({
            importId: importRow.id,
            rowIndex: line.rowIndex,
            rawData: line.rawData,
            date: line.date,
            description: line.description,
            counterparty: line.counterparty,
            direction: line.direction,
            amount: String(line.amount),
            type: line.type,
            status: line.status,
            dedupeKey: line.dedupeKey,
          })),
        );
      }

      return toImport(importRow);
    });
  }

  async listImports(financialAccountId?: string): Promise<BankStatementImport[]> {
    const rows = financialAccountId
      ? await this.db().select().from(importsTable).where(eq(importsTable.financialAccountId, financialAccountId))
      : await this.db().select().from(importsTable);
    return rows.map(toImport).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listLines(filter?: { financialAccountId?: string; status?: BankStatementLine["status"]; dateFrom?: string; dateTo?: string; direction?: BankStatementLine["direction"]; type?: BankStatementLine["type"]; types?: BankStatementLine["type"][] }): Promise<BankStatementLine[]> {
    const conditions = [];
    if (filter?.status) conditions.push(eq(linesTable.status, filter.status));
    if (filter?.dateFrom) conditions.push(gte(linesTable.date, filter.dateFrom));
    if (filter?.dateTo) conditions.push(lte(linesTable.date, filter.dateTo));
    if (filter?.direction) conditions.push(eq(linesTable.direction, filter.direction));
    if (filter?.type) conditions.push(eq(linesTable.type, filter.type));
    if (filter?.types && filter.types.length > 0) conditions.push(inArray(linesTable.type, filter.types));

    if (filter?.financialAccountId) {
      const importIds = await this.db().select({ id: importsTable.id }).from(importsTable).where(eq(importsTable.financialAccountId, filter.financialAccountId));
      if (importIds.length === 0) return [];
      conditions.push(inArray(linesTable.importId, importIds.map((r) => r.id)));
    }

    const rows = conditions.length > 0 ? await this.db().select().from(linesTable).where(and(...conditions)) : await this.db().select().from(linesTable);
    return rows.map(toLine).sort((a, b) => b.date.localeCompare(a.date) || a.rowIndex - b.rowIndex);
  }

  async getLine(id: string): Promise<BankStatementLine | null> {
    const rows = await this.db().select().from(linesTable).where(eq(linesTable.id, id)).limit(1);
    return rows[0] ? toLine(rows[0]) : null;
  }

  async updateLine(input: UpdateBankStatementLineInput): Promise<BankStatementLine> {
    const values: Partial<typeof linesTable.$inferInsert> = { updatedAt: new Date() };
    if (input.status !== undefined) values.status = input.status;
    if (input.type !== undefined) values.type = input.type;
    if (input.categoryId !== undefined) values.categoryId = input.categoryId;
    if (input.supplierId !== undefined) values.supplierId = input.supplierId;
    if (input.partnerId !== undefined) values.partnerId = input.partnerId;
    if (input.matchedStoneAmount !== undefined) values.matchedStoneAmount = input.matchedStoneAmount !== null ? String(input.matchedStoneAmount) : null;
    if (input.matchedStoneDivergence !== undefined) values.matchedStoneDivergence = input.matchedStoneDivergence !== null ? String(input.matchedStoneDivergence) : null;
    if (input.linkedAccountsReceivableId !== undefined) values.linkedAccountsReceivableId = input.linkedAccountsReceivableId;
    if (input.linkedAccountsPayableId !== undefined) values.linkedAccountsPayableId = input.linkedAccountsPayableId;
    if (input.linkedCashMovementId !== undefined) values.linkedCashMovementId = input.linkedCashMovementId;
    if (input.linkedAccountTransferId !== undefined) values.linkedAccountTransferId = input.linkedAccountTransferId;
    if (input.reconciliationNote !== undefined) values.reconciliationNote = input.reconciliationNote;
    if (input.processedBy !== undefined) values.processedBy = input.processedBy;

    const [row] = await this.db().update(linesTable).set(values).where(eq(linesTable.id, input.id)).returning();
    if (!row) throw new Error(`Linha de extrato não encontrada: ${input.id}`);
    return toLine(row);
  }

  async listClassificationRules(activeOnly?: boolean): Promise<BankStatementClassificationRule[]> {
    const rows = activeOnly ? await this.db().select().from(rulesTable).where(eq(rulesTable.active, true)) : await this.db().select().from(rulesTable);
    return rows.map(toRule);
  }

  async createClassificationRule(input: CreateBankStatementClassificationRuleInput): Promise<BankStatementClassificationRule> {
    const [row] = await this.db()
      .insert(rulesTable)
      .values({
        criteriaDirection: input.criteriaDirection ?? null,
        criteriaCounterpartyPattern: input.criteriaCounterpartyPattern ?? null,
        criteriaDescriptionKeyword: input.criteriaDescriptionKeyword ?? null,
        resultingType: input.resultingType,
        categoryId: input.categoryId ?? null,
        supplierId: input.supplierId ?? null,
        partnerId: input.partnerId ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    return toRule(row);
  }

  async incrementRuleAppliedCount(ruleId: string): Promise<void> {
    await this.db()
      .update(rulesTable)
      .set({ appliedCount: sql`${rulesTable.appliedCount} + 1`, updatedAt: new Date() })
      .where(eq(rulesTable.id, ruleId));
  }

  async deactivateClassificationRule(ruleId: string): Promise<BankStatementClassificationRule> {
    const [row] = await this.db().update(rulesTable).set({ active: false, updatedAt: new Date() }).where(eq(rulesTable.id, ruleId)).returning();
    if (!row) throw new Error(`Regra não encontrada: ${ruleId}`);
    return toRule(row);
  }
}
