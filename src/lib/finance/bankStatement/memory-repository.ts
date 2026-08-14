import "server-only";
import { randomUUID } from "node:crypto";
import type { BankStatementRepository, CreateImportWithLinesInput, UpdateBankStatementLineInput } from "@/lib/finance/bankStatement/repository";
import type { BankStatementImport, BankStatementLine } from "@/lib/finance/bankStatement/types";

export class BankStatementMemoryRepository implements BankStatementRepository {
  private imports = new Map<string, BankStatementImport>();
  private lines = new Map<string, BankStatementLine>();

  async listExistingDedupeKeys(financialAccountId: string): Promise<Set<string>> {
    const importIds = new Set([...this.imports.values()].filter((i) => i.financialAccountId === financialAccountId).map((i) => i.id));
    return new Set([...this.lines.values()].filter((l) => importIds.has(l.importId)).map((l) => l.dedupeKey));
  }

  async createImportWithLines(input: CreateImportWithLinesInput): Promise<BankStatementImport> {
    const importRow: BankStatementImport = {
      id: randomUUID(),
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
      notes: null,
      createdAt: new Date().toISOString(),
    };
    this.imports.set(importRow.id, importRow);

    for (const line of input.newLines) {
      const row: BankStatementLine = {
        id: randomUUID(),
        importId: importRow.id,
        rowIndex: line.rowIndex,
        rawData: line.rawData,
        date: line.date,
        description: line.description,
        counterparty: line.counterparty,
        direction: line.direction,
        amount: line.amount,
        type: line.type,
        status: line.status,
        categoryId: null,
        supplierId: null,
        partnerId: null,
        matchedStoneAmount: null,
        matchedStoneDivergence: null,
        linkedAccountsReceivableId: null,
        linkedAccountsPayableId: null,
        linkedCashMovementId: null,
        linkedAccountTransferId: null,
        reconciliationNote: null,
        processedBy: null,
        dedupeKey: line.dedupeKey,
      };
      this.lines.set(row.id, row);
    }

    return { ...importRow };
  }

  async listImports(financialAccountId?: string): Promise<BankStatementImport[]> {
    const all = [...this.imports.values()];
    return (financialAccountId ? all.filter((i) => i.financialAccountId === financialAccountId) : all).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listLines(filter?: { financialAccountId?: string; status?: BankStatementLine["status"]; dateFrom?: string; dateTo?: string; direction?: BankStatementLine["direction"] }): Promise<BankStatementLine[]> {
    let result = [...this.lines.values()];
    if (filter?.financialAccountId) {
      const importIds = new Set([...this.imports.values()].filter((i) => i.financialAccountId === filter.financialAccountId).map((i) => i.id));
      result = result.filter((l) => importIds.has(l.importId));
    }
    if (filter?.status) result = result.filter((l) => l.status === filter.status);
    if (filter?.dateFrom) result = result.filter((l) => l.date >= filter.dateFrom!);
    if (filter?.dateTo) result = result.filter((l) => l.date <= filter.dateTo!);
    if (filter?.direction) result = result.filter((l) => l.direction === filter.direction);
    return result.sort((a, b) => b.date.localeCompare(a.date) || a.rowIndex - b.rowIndex).map((l) => ({ ...l }));
  }

  async getLine(id: string): Promise<BankStatementLine | null> {
    const row = this.lines.get(id);
    return row ? { ...row } : null;
  }

  async updateLine(input: UpdateBankStatementLineInput): Promise<BankStatementLine> {
    const existing = this.lines.get(input.id);
    if (!existing) throw new Error(`Linha de extrato não encontrada: ${input.id}`);
    const updated: BankStatementLine = { ...existing };
    if (input.status !== undefined) updated.status = input.status;
    if (input.type !== undefined) updated.type = input.type;
    if (input.categoryId !== undefined) updated.categoryId = input.categoryId;
    if (input.supplierId !== undefined) updated.supplierId = input.supplierId;
    if (input.partnerId !== undefined) updated.partnerId = input.partnerId;
    if (input.matchedStoneAmount !== undefined) updated.matchedStoneAmount = input.matchedStoneAmount;
    if (input.matchedStoneDivergence !== undefined) updated.matchedStoneDivergence = input.matchedStoneDivergence;
    if (input.linkedAccountsReceivableId !== undefined) updated.linkedAccountsReceivableId = input.linkedAccountsReceivableId;
    if (input.linkedAccountsPayableId !== undefined) updated.linkedAccountsPayableId = input.linkedAccountsPayableId;
    if (input.linkedCashMovementId !== undefined) updated.linkedCashMovementId = input.linkedCashMovementId;
    if (input.linkedAccountTransferId !== undefined) updated.linkedAccountTransferId = input.linkedAccountTransferId;
    if (input.reconciliationNote !== undefined) updated.reconciliationNote = input.reconciliationNote;
    if (input.processedBy !== undefined) updated.processedBy = input.processedBy;
    this.lines.set(input.id, updated);
    return { ...updated };
  }
}
