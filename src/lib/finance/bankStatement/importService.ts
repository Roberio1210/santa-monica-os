import "server-only";
import { parseBankStatementCsv } from "@/lib/finance/bankStatement/csvFormat";
import { assignOccurrenceIndices, computeDedupeKey } from "@/lib/finance/bankStatement/dedupe";
import { inferBankStatementLineType, initialStatusForType } from "@/lib/finance/bankStatement/classification";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import type { BankStatementImport } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.1 (Fase C) — importação em 2 fases, mesmo padrão de
 * `purchase-import-service.ts` (Missão 23): `dryRunImport` nunca escreve no banco, só calcula e
 * mostra contagens; `confirmImport` persiste só as linhas realmente novas (nunca duplica — chave
 * de deduplicação determinística verificada no início).
 */
export interface DryRunLinePreview {
  rowIndex: number;
  date: string | null;
  description: string | null;
  counterparty: string | null;
  direction: "entrada" | "saida" | null;
  amount: number | null;
  errors: string[];
  isDuplicate: boolean;
  dedupeKey: string | null;
  inferredType: string | null;
}

export interface DryRunResult {
  summary: { totalRows: number; validRows: number; invalidRows: number; newRows: number; duplicateRows: number };
  lines: DryRunLinePreview[];
}

export async function dryRunBankStatementImport(financialAccountId: string, csvContent: string): Promise<DryRunResult> {
  const rawRows = parseBankStatementCsv(csvContent);
  if (rawRows.length === 0) throw new Error("Nenhuma linha encontrada no arquivo.");

  const existingKeys = await getBankStatementRepository().listExistingDedupeKeys(financialAccountId);

  const validRows = rawRows.filter((r) => r.errors.length === 0 && r.date && r.description && r.direction && r.amount !== null);
  const withOccurrence = assignOccurrenceIndices(
    validRows.map((r) => ({ financialAccountId, date: r.date!, direction: r.direction!, amount: r.amount!, description: r.description!, counterparty: r.counterparty })),
  );

  const keyByRowIndex = new Map<number, string>();
  validRows.forEach((r, i) => keyByRowIndex.set(r.rowIndex, computeDedupeKey(withOccurrence[i])));

  const lines: DryRunLinePreview[] = rawRows.map((r) => {
    const dedupeKey = keyByRowIndex.get(r.rowIndex) ?? null;
    const isDuplicate = dedupeKey !== null && existingKeys.has(dedupeKey);
    const inferredType = r.errors.length === 0 && r.description && r.direction ? inferBankStatementLineType(r.description, r.direction) : null;
    return { rowIndex: r.rowIndex, date: r.date, description: r.description, counterparty: r.counterparty, direction: r.direction, amount: r.amount, errors: r.errors, isDuplicate, dedupeKey, inferredType };
  });

  const invalidRows = lines.filter((l) => l.errors.length > 0).length;
  const duplicateRows = lines.filter((l) => l.isDuplicate).length;
  const newRows = lines.length - invalidRows - duplicateRows;

  return { summary: { totalRows: lines.length, validRows: lines.length - invalidRows, invalidRows, newRows, duplicateRows }, lines };
}

export interface ConfirmImportInput {
  financialAccountId: string;
  fileFormat: string;
  filename: string | null;
  importedBy: string;
  csvContent: string;
}

export async function confirmBankStatementImport(input: ConfirmImportInput): Promise<BankStatementImport> {
  if (!input.importedBy.trim()) throw new Error("Responsável pela importação é obrigatório.");

  const dryRun = await dryRunBankStatementImport(input.financialAccountId, input.csvContent);
  const newLines = dryRun.lines.filter((l) => l.errors.length === 0 && !l.isDuplicate);

  const dates = newLines.map((l) => l.date!).sort();
  const periodFrom = dates[0] ?? null;
  const periodTo = dates[dates.length - 1] ?? null;

  const repo = getBankStatementRepository();
  return repo.createImportWithLines({
    financialAccountId: input.financialAccountId,
    fileFormat: input.fileFormat,
    filename: input.filename,
    periodFrom,
    periodTo,
    importedBy: input.importedBy.trim(),
    totalRowCount: dryRun.summary.totalRows,
    duplicateRowCount: dryRun.summary.duplicateRows,
    newLines: newLines.map((l) => {
      const type = inferBankStatementLineType(l.description!, l.direction!);
      return {
        rowIndex: l.rowIndex,
        rawData: { date: l.date, description: l.description, counterparty: l.counterparty, direction: l.direction, amount: l.amount },
        date: l.date!,
        description: l.description!,
        counterparty: l.counterparty,
        direction: l.direction!,
        amount: l.amount!,
        type,
        status: initialStatusForType(type),
        dedupeKey: l.dedupeKey!,
      };
    }),
  });
}
