/**
 * Missão Financeiro V2.1 — extrato bancário real. Espelha src/db/schema/bankStatement.ts;
 * qualquer mudança no schema deve ser replicada aqui e vice-versa (mesmo padrão de finance/types.ts).
 */
export type BankStatementLineDirection = "entrada" | "saida";

export type BankStatementLineType =
  | "recebimento_venda_stone"
  | "antecipacao_credito"
  | "pix_recebido"
  | "pix_enviado"
  | "transferencia_entrada"
  | "transferencia_saida"
  | "aporte"
  | "retirada"
  | "pagamento"
  | "tarifa"
  | "mensalidade_stone"
  | "devolucao"
  | "outro";

export type BankStatementLineStatus = "conciliado" | "sugerido" | "nao_conciliado" | "a_classificar" | "ignorado";

/** Tipos elegíveis à conciliação automática contra `stone_normalized_transactions` — nunca geram receita nova. */
export const STONE_SETTLEMENT_LINE_TYPES: readonly BankStatementLineType[] = ["recebimento_venda_stone", "antecipacao_credito"];

export interface BankStatementImport {
  id: string;
  financialAccountId: string;
  fileFormat: string;
  filename: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  importedBy: string;
  status: "previa" | "processado";
  rowCount: number;
  newRowCount: number;
  duplicateRowCount: number;
  notes: string | null;
  createdAt: string;
}

export interface BankStatementLine {
  id: string;
  importId: string;
  rowIndex: number;
  rawData: Record<string, unknown>;
  date: string;
  description: string;
  counterparty: string | null;
  direction: BankStatementLineDirection;
  amount: number;
  type: BankStatementLineType;
  status: BankStatementLineStatus;
  categoryId: string | null;
  supplierId: string | null;
  partnerId: string | null;
  matchedStoneAmount: number | null;
  matchedStoneDivergence: number | null;
  linkedAccountsReceivableId: string | null;
  linkedAccountsPayableId: string | null;
  linkedCashMovementId: string | null;
  linkedAccountTransferId: string | null;
  reconciliationNote: string | null;
  processedBy: string | null;
  dedupeKey: string;
}

export interface RawBankStatementLineInput {
  date: string;
  description: string;
  counterparty: string | null;
  direction: BankStatementLineDirection;
  amount: number;
}

export interface CreateBankStatementImportInput {
  financialAccountId: string;
  fileFormat: string;
  filename: string | null;
  importedBy: string;
  lines: RawBankStatementLineInput[];
}

export interface BankStatementImportResult {
  importId: string;
  summary: { totalRows: number; newRows: number; duplicateRows: number };
  lines: BankStatementLine[];
}

/**
 * Decisão explícita do operador para transformar uma linha em movimentação real (Fase B/D da
 * missão) — nunca inferida sozinha. `resultingType` pode divergir do `type` sugerido pela
 * classificação automática (o operador sempre pode corrigir).
 */
export interface ProcessBankStatementLineInput {
  lineId: string;
  resultingType: BankStatementLineType;
  performedBy: string;
  /** Só usado quando resultingType é transferência/aporte/retirada — a outra ponta da movimentação. */
  counterAccountId?: string | null;
  linkedAccountsReceivableId?: string | null;
  linkedAccountsPayableId?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  notes?: string | null;
}

export interface MarkLineIgnoredInput {
  lineId: string;
  reason: string;
  performedBy: string;
}

/**
 * Missão Financeiro V2.2 (Fase H/V) — regra ensinada pelo gestor a partir da confirmação de um
 * grupo. Espelha `bank_statement_classification_rules` (schema/bankStatement.ts).
 */
export interface BankStatementClassificationRule {
  id: string;
  criteriaDirection: BankStatementLineDirection | null;
  criteriaCounterpartyPattern: string | null;
  criteriaDescriptionKeyword: string | null;
  resultingType: BankStatementLineType;
  categoryId: string | null;
  supplierId: string | null;
  partnerId: string | null;
  appliedCount: number;
  createdBy: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateBankStatementClassificationRuleInput {
  criteriaDirection?: BankStatementLineDirection | null;
  criteriaCounterpartyPattern?: string | null;
  criteriaDescriptionKeyword?: string | null;
  resultingType: BankStatementLineType;
  categoryId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  createdBy: string;
}
