import type { BankStatementImport, BankStatementLine, RawBankStatementLineInput } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.1 — persistência do extrato bancário, mesmo padrão de
 * `stone/persistence/repository.ts` (interface desacoplada, Postgres quando configurado, memória
 * caso contrário).
 */
export interface CreateImportWithLinesInput {
  financialAccountId: string;
  fileFormat: string;
  filename: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  importedBy: string;
  /** Já com dedupeKey calculado — linhas cujo dedupeKey já existe no banco são descartadas antes de chamar isto (dry-run separado). */
  newLines: (RawBankStatementLineInput & { rowIndex: number; rawData: Record<string, unknown>; type: BankStatementLine["type"]; status: BankStatementLine["status"]; dedupeKey: string })[];
  totalRowCount: number;
  duplicateRowCount: number;
}

export interface UpdateBankStatementLineInput {
  id: string;
  status?: BankStatementLine["status"];
  type?: BankStatementLine["type"];
  categoryId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  matchedStoneAmount?: number | null;
  matchedStoneDivergence?: number | null;
  linkedAccountsReceivableId?: string | null;
  linkedAccountsPayableId?: string | null;
  linkedCashMovementId?: string | null;
  linkedAccountTransferId?: string | null;
  reconciliationNote?: string | null;
  processedBy?: string | null;
}

export interface BankStatementRepository {
  /** Chaves já existentes no banco para uma conta — usado no dry-run para separar novas de duplicadas antes de persistir. */
  listExistingDedupeKeys(financialAccountId: string): Promise<Set<string>>;
  createImportWithLines(input: CreateImportWithLinesInput): Promise<BankStatementImport>;
  listImports(financialAccountId?: string): Promise<BankStatementImport[]>;
  listLines(filter?: { financialAccountId?: string; status?: BankStatementLine["status"]; dateFrom?: string; dateTo?: string; direction?: BankStatementLine["direction"] }): Promise<BankStatementLine[]>;
  getLine(id: string): Promise<BankStatementLine | null>;
  updateLine(input: UpdateBankStatementLineInput): Promise<BankStatementLine>;
}
