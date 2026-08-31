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

/**
 * Missão Financeiro V7 (saneamento de auditoria, 30/08/2026) — incidente real: uma auditoria
 * gerencial concluiu que três Pix recebidos via maquininha Stone "não existiam na Stone", quando
 * na verdade existiam desde a importação original — só não apareciam porque a consulta usava
 * `type = "pix_recebido"` sozinho. Todo Pix de cliente recebido
 * via maquininha cujo texto original bate no padrão "Pix | Maquininha" é classificado como
 * `recebimento_venda_stone` por decisão deliberada da Missão V2.3 (ver `classification.ts`,
 * regra "pix\s*\|?\s*maquininha") — uma representação legítima e igualmente válida de "Pix
 * recebido de cliente", nunca um tipo "diferente" ou "menos correto" que `pix_recebido`. Qualquer
 * consulta que precise enumerar recebimentos Pix de clientes na Stone DEVE usar esta constante
 * (via `listPixStoneReceivedLines`, `pixStoneQueries.ts`) em vez de comparar contra um único
 * valor de `type` — o objetivo é que esta classe de erro não possa se repetir, nem aqui nem em
 * nenhuma consulta futura que reutilize esta lista.
 */
export const PIX_STONE_RECEIVED_LINE_TYPES: readonly BankStatementLineType[] = ["pix_recebido", "recebimento_venda_stone"];

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
