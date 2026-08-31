import type { BankStatementClassificationRule, BankStatementImport, BankStatementLine, CreateBankStatementClassificationRuleInput, RawBankStatementLineInput } from "@/lib/finance/bankStatement/types";

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
  /**
   * `types` (plural) filtra por qualquer um dos tipos da lista — use para representações
   * legítimas mas heterogêneas do mesmo fato (ver `PIX_STONE_RECEIVED_LINE_TYPES`,
   * `types.ts`). Independente de `type` (singular); se ambos forem passados, a linha precisa
   * satisfazer os dois.
   */
  listLines(filter?: { financialAccountId?: string; status?: BankStatementLine["status"]; dateFrom?: string; dateTo?: string; direction?: BankStatementLine["direction"]; type?: BankStatementLine["type"]; types?: BankStatementLine["type"][] }): Promise<BankStatementLine[]>;
  getLine(id: string): Promise<BankStatementLine | null>;
  updateLine(input: UpdateBankStatementLineInput): Promise<BankStatementLine>;

  // --- Missão Financeiro V2.2 (Fase H/V) — regras ensinadas ---
  listClassificationRules(activeOnly?: boolean): Promise<BankStatementClassificationRule[]>;
  createClassificationRule(input: CreateBankStatementClassificationRuleInput): Promise<BankStatementClassificationRule>;
  /** Incrementa `appliedCount` — nunca decrementado, só histórico de quantas vezes a regra já classificou algo. */
  incrementRuleAppliedCount(ruleId: string): Promise<void>;
  deactivateClassificationRule(ruleId: string): Promise<BankStatementClassificationRule>;
}
