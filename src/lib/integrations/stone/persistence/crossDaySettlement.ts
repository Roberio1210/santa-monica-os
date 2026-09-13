/**
 * Missão 69 — correlação de liquidação entre dias diferentes. A Missão 68 comprovou com dado real
 * da Stone (venda em 22/07/2026, liquidação no arquivo de referenceDate=23/07/2026, 10/10 vendas
 * correspondendo exatamente por `acquirerTransactionKey`+`installmentNumber`, com `netAmount`
 * idêntico) que `buildNormalizedTransactionRecords` (`mapping.ts`) nunca tem chance de casar
 * liquidação com venda: ele só cruza `day.settlements` contra `day.expectedPayments` do MESMO
 * arquivo/dia, e a liquidação de uma venda quase sempre chega no arquivo de um dia diferente.
 *
 * Pura — nenhum I/O aqui (mesma separação de `bankStatement/reconciliation.ts`). Quem busca os
 * candidatos no banco e persiste o resultado é `importRun.ts` (`applyCrossDaySettlements`).
 *
 * Regras (Missão 69, decisão do usuário — nunca inventar correspondência):
 * - identidade determinística: `acquirerTransactionKey` + `installmentNumber` — nunca valor
 *   isolado, nunca data isolada, nunca posição no arquivo;
 * - `netAmount` é INVARIANTE DE VALIDAÇÃO, nunca substituto da identidade — chave batendo com
 *   valor divergente é conflito, nunca uma correspondência forçada;
 * - mais de um candidato para a mesma identidade nunca é resolvido arbitrariamente — conflito;
 * - venda já com `settledPaymentDate` preenchido nunca é sobrescrita — mesmo que o novo settlement
 *   pareça bater, o registro já liquidado é definitivo.
 */

export interface CrossDaySettlementInput {
  /** == `acquirerTransactionKey` da venda — mesmo campo, nome mantido do `NormalizedSettlement`. */
  saleExternalReference: string;
  installmentNumber: number;
  netAmount: number;
  settledPaymentDate: string;
}

export interface CrossDaySettlementCandidate {
  externalKey: string;
  settledPaymentDate: string | null;
  /** `netAmount` já persistido da venda (o valor esperado) — nunca o da própria liquidação. */
  netAmount: number;
}

export type CrossDaySettlementResolution =
  | { status: "matched"; externalKey: string; settledPaymentDate: string; settledAmount: number }
  | { status: "no_candidate" }
  | { status: "already_settled"; externalKey: string }
  | { status: "conflict"; reason: "multiple_candidates"; candidateKeys: string[] }
  | { status: "conflict"; reason: "amount_mismatch"; externalKey: string; expectedNetAmount: number; settlementNetAmount: number };

/** Mesma tolerância de 1 centavo já usada por `matchStatementLineAgainstStoneSettlements` (`bankStatement/reconciliation.ts`) — nunca um número novo. */
export const SETTLEMENT_MATCH_TOLERANCE_CENTS = 1;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function resolveCrossDaySettlement(settlement: CrossDaySettlementInput, candidates: CrossDaySettlementCandidate[]): CrossDaySettlementResolution {
  if (candidates.length === 0) return { status: "no_candidate" };

  if (candidates.length > 1) {
    return { status: "conflict", reason: "multiple_candidates", candidateKeys: candidates.map((c) => c.externalKey) };
  }

  const candidate = candidates[0];

  // Regra crítica de não sobrescrita — mesmo que o valor bata, uma liquidação já registrada é definitiva.
  if (candidate.settledPaymentDate !== null) {
    return { status: "already_settled", externalKey: candidate.externalKey };
  }

  const divergenceCents = toCents(candidate.netAmount) - toCents(settlement.netAmount);
  if (Math.abs(divergenceCents) > SETTLEMENT_MATCH_TOLERANCE_CENTS) {
    return { status: "conflict", reason: "amount_mismatch", externalKey: candidate.externalKey, expectedNetAmount: candidate.netAmount, settlementNetAmount: settlement.netAmount };
  }

  return { status: "matched", externalKey: candidate.externalKey, settledPaymentDate: settlement.settledPaymentDate, settledAmount: settlement.netAmount };
}
