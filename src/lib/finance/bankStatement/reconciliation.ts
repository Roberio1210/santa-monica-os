import type { BankStatementLineStatus } from "@/lib/finance/bankStatement/types";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

/**
 * Missão Financeiro V2.1 (Fase B/D) — concilia uma linha de "recebimento de vendas"/"antecipação"
 * do extrato Stone contra as parcelas liquidadas conhecidas (`stone_normalized_transactions`,
 * `settledPaymentDate`/`settledAmount`). NUNCA cria receita nova: só confirma que o dinheiro que
 * entrou é a liquidação de vendas já existentes. Quando não há dado Stone sincronizado para a
 * data, a linha fica "não conciliado" (nunca "conciliado" por ausência de contradição — silêncio
 * não é confirmação).
 */
export interface StoneSettlementMatchResult {
  status: BankStatementLineStatus;
  matchedStoneAmount: number | null;
  matchedStoneDivergence: number | null;
  note: string;
}

const MATCH_TOLERANCE_CENTS = 1; // arredondamento de centavos, nunca mais que isso

export function matchStatementLineAgainstStoneSettlements(lineAmount: number, lineDate: string, settledTransactionsForDate: StoneNormalizedTransactionRecord[]): StoneSettlementMatchResult {
  if (settledTransactionsForDate.length === 0) {
    return {
      status: "nao_conciliado",
      matchedStoneAmount: null,
      matchedStoneDivergence: null,
      note: `Nenhuma transação Stone com liquidação em ${lineDate} encontrada em stone_normalized_transactions — sem dado para conferir.`,
    };
  }

  const totalSettledCents = settledTransactionsForDate.reduce((sum, tx) => sum + Math.round((tx.settledAmount ?? tx.netAmount) * 100), 0);
  const lineCents = Math.round(lineAmount * 100);
  const divergenceCents = lineCents - totalSettledCents;
  const matchedStoneAmount = totalSettledCents / 100;
  const matchedStoneDivergence = divergenceCents / 100;

  if (Math.abs(divergenceCents) <= MATCH_TOLERANCE_CENTS) {
    return {
      status: "conciliado",
      matchedStoneAmount,
      matchedStoneDivergence: 0,
      note: `Bate com ${settledTransactionsForDate.length} parcela(s) liquidada(s) em ${lineDate} (Stone).`,
    };
  }

  return {
    status: "sugerido",
    matchedStoneAmount,
    matchedStoneDivergence,
    note: `Divergência de R$ ${matchedStoneDivergence.toFixed(2)} entre o extrato e a soma de ${settledTransactionsForDate.length} parcela(s) Stone liquidada(s) em ${lineDate} — revisar antes de confirmar.`,
  };
}
