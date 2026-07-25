import type { ReconciliationResult } from "@/lib/integrations/stone/jumpparkReconciliation";
import type { Divergence } from "@/lib/integrations/stone/divergences";
import type { StoneResultStatus } from "@/lib/integrations/stone/types";

/**
 * Tipos de domínio da persistência Stone (Sprint 7.0, Z4, decisão do usuário) — independentes das
 * linhas do Drizzle (`src/db/schema/stone.ts`); os repositórios (`memory-repository.ts`/
 * `postgres-repository.ts`) convertem entre este formato e o formato de armazenamento. Valores
 * monetários aqui são sempre `number` (decimal), nunca `string` — a conversão para/de `numeric`
 * do Postgres é responsabilidade exclusiva do `postgres-repository.ts`.
 */

export type StoneImportRunStatus = "running" | "succeeded" | "failed";
export type StoneFileLayout = "XML2_2" | "XML2_4";

export interface StoneImportRun {
  id: string;
  requestedPeriodFrom: string | null;
  requestedPeriodTo: string | null;
  referenceDate: string;
  layout: StoneFileLayout;
  fileHash: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: StoneImportRunStatus;
  recordCount: number | null;
  errorSanitized: string | null;
  /** Só preenchido quando `status === "failed"` — o `StoneResultStatus` (Z1) que causou a falha, usado por `healthStatus.ts` para nunca precisar casar texto de erro. */
  failureStatus: StoneResultStatus | null;
  origin: string;
  createdAt: string;
  updatedAt: string;
}

export interface StartImportRunInput {
  referenceDate: string;
  layout: StoneFileLayout;
  requestedPeriodFrom: string | null;
  requestedPeriodTo: string | null;
  origin: string;
}

export interface FinishImportRunInput {
  id: string;
  status: "succeeded" | "failed";
  recordCount: number | null;
  errorSanitized: string | null;
  failureStatus: StoneResultStatus | null;
  fileHash: string | null;
}

export type StoneTransactionEventType = "sale" | "cancellation" | "chargeback" | "chargeback_refund";
export type StoneReceivableStateRecord =
  | "scheduled"
  | "due_today"
  | "settled_on_time"
  | "settled_early"
  | "overdue"
  | "cancelled"
  | "reversed"
  | "chargeback"
  | "unknown";

export interface StoneNormalizedTransactionRecord {
  externalKey: string;
  acquirerTransactionKey: string;
  authorizationCode: string;
  initiatorTransactionKey: string | null;
  establishmentCode: string;
  terminalSerialNumber: string | null;
  capturedAt: string;
  installmentNumber: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  paymentMethod: string | null;
  brandId: string | null;
  eventType: StoneTransactionEventType;
  receivableState: StoneReceivableStateRecord;
  expectedPaymentDate: string | null;
  settledPaymentDate: string | null;
  settledAmount: number | null;
  sourceFile: string;
  importRunId: string | null;
}

export type StoneMatchConfidence = "high" | "medium" | "low";

export interface StoneReconciliationResultRecord {
  naturalKey: string;
  stoneSaleExternalKey: string | null;
  jumpparkOrderExternalId: string | null;
  matchType: ReconciliationResult["type"];
  confidence: StoneMatchConfidence;
  heuristicScore: number | null;
  favorableSignals: string[];
  contrarySignals: string[];
  ruleApplied: string;
  periodFrom: string;
  periodTo: string;
}

export type StoneReviewStatus = "open" | "under_review" | "confirmed_issue" | "resolved" | "ignored" | "pending_processing";

export interface StoneReconciliationResultRow extends StoneReconciliationResultRecord {
  id: string;
  reviewStatus: StoneReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoneDivergenceRecord {
  naturalKey: string;
  type: Divergence["type"];
  priority: Divergence["priority"];
  financialImpact: number;
  evidence: string[];
  involvedStoneSaleExternalKey: string | null;
  involvedJumpparkOrderExternalId: string | null;
  confidence: StoneMatchConfidence;
  recommendation: string;
  periodFrom: string;
  periodTo: string;
}

export interface StoneDivergenceRow extends StoneDivergenceRecord {
  id: string;
  status: StoneReviewStatus;
  assignee: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateDivergenceReviewInput {
  id: string;
  status: StoneReviewStatus;
  assignee?: string | null;
  resolutionNote?: string | null;
}

/**
 * Chave natural determinística de um `ReconciliationResult` — nunca só o `type` (colidiria entre
 * pares diferentes). Os invariantes do motor de matching (`jumpparkReconciliation.ts`) garantem
 * que cada venda Stone e cada pedido JumpPark aparece no máximo uma vez por categoria de
 * resultado, então `type + stoneKey + jumpparkId` já é suficiente — nenhum índice extra
 * necessário mesmo para `duplicate` (cada venda duplicada tem sua própria `acquirerTransactionKey`).
 */
export function buildReconciliationNaturalKey(result: ReconciliationResult): string {
  return [result.type, result.stoneSale?.externalReference ?? "none", result.jumpparkOrder?.externalReference ?? "none"].join(":");
}

/**
 * Chave natural determinística de uma `Divergence`. Quando os dois registros envolvidos são nulos
 * (ex.: `arquivo_stone_ausente_ou_defasado`, que não referencia venda nem pedido específico), usa
 * a evidência (que sempre inclui a data de referência do arquivo) como desambiguador — garante uma
 * linha por dia/status, nunca uma única linha genérica sobrescrita a cada reprocessamento.
 */
export function buildDivergenceNaturalKey(divergence: Divergence): string {
  const { stoneSaleRef, jumpparkOrderRef } = divergence.involvedRecords;
  if (stoneSaleRef === null && jumpparkOrderRef === null) {
    return [divergence.type, "none", "none", divergence.evidence.join("|")].join(":");
  }
  return [divergence.type, stoneSaleRef ?? "none", jumpparkOrderRef ?? "none"].join(":");
}
