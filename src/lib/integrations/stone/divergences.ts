import type { DayFetchResult } from "@/lib/integrations/stone/multiDay";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";
import type { MatchConfidenceLevel, ReconciliationResult } from "@/lib/integrations/stone/jumpparkReconciliation";

/**
 * Divergências estruturadas (Sprint 7.0, Z3, decisão do usuário) — nunca cria conta, lançamento
 * ou correção; só sinaliza para conferência humana. `date_mismatch` e `pending_processing`
 * (tipos de `ReconciliationResult`) deliberadamente **não** viram divergência: o primeiro não se
 * encaixa honestamente em nenhuma das 11 categorias pedidas (é um sinal de confiança mais fraca,
 * não uma categoria de erro fechada); o segundo é, por definição, "ainda não é um erro".
 */

export type DivergenceType =
  | "venda_jumppark_nao_encontrada_na_stone"
  | "transacao_stone_nao_encontrada_no_jumppark"
  | "diferenca_de_valor"
  | "diferenca_forma_pagamento"
  | "diferenca_parcelamento"
  | "possivel_duplicidade"
  | "cancelamento_nao_refletido_internamente"
  | "estorno"
  | "chargeback"
  | "correspondencia_ambigua"
  | "arquivo_stone_ausente_ou_defasado";

/** Mesmos 3 níveis de `PriorityLevel` (`directors/priority.ts`) — mirrorado, nunca importado (esta camada nunca depende de `zezinho/`, mesma independência de `integrations/weather`). */
export type DivergencePriority = "alta" | "media" | "baixa";

export interface Divergence {
  type: DivergenceType;
  priority: DivergencePriority;
  evidence: string[];
  /** Valor em jogo — sempre positivo, decimal seguro (nunca float impreciso). `0` quando não há um valor específico associável (ex.: arquivo ausente). */
  financialImpact: number;
  involvedRecords: { jumpparkOrderRef: string | null; stoneSaleRef: string | null };
  confidence: MatchConfidenceLevel;
  reviewRecommendation: string;
  /** Sempre nasce `"identificado"` — mesma disciplina do `ActionPlanStatus` (Z2): nenhuma divergência começa em outro estado. */
  status: "identificado";
}

const RECONCILIATION_TYPE_MAP: Partial<Record<ReconciliationResult["type"], DivergenceType>> = {
  unmatched_jumppark: "venda_jumppark_nao_encontrada_na_stone",
  unmatched_stone: "transacao_stone_nao_encontrada_no_jumppark",
  value_mismatch: "diferenca_de_valor",
  payment_method_mismatch: "diferenca_forma_pagamento",
  installment_mismatch: "diferenca_parcelamento",
  duplicate: "possivel_duplicidade",
  reversed: "cancelamento_nao_refletido_internamente",
  ambiguous: "correspondencia_ambigua",
};

const PRIORITY_BY_TYPE: Record<DivergenceType, DivergencePriority> = {
  venda_jumppark_nao_encontrada_na_stone: "media",
  transacao_stone_nao_encontrada_no_jumppark: "media",
  diferenca_de_valor: "alta",
  diferenca_forma_pagamento: "media",
  diferenca_parcelamento: "media",
  possivel_duplicidade: "alta",
  cancelamento_nao_refletido_internamente: "media",
  estorno: "alta",
  chargeback: "alta",
  correspondencia_ambigua: "media",
  arquivo_stone_ausente_ou_defasado: "media",
};

const RECOMMENDATION_BY_TYPE: Record<DivergenceType, string> = {
  venda_jumppark_nao_encontrada_na_stone: "Conferir manualmente se a venda foi processada pela Stone sob outro identificador ou se houve falha de captura.",
  transacao_stone_nao_encontrada_no_jumppark: "Conferir se a venda foi registrada no JumpPark ou se é uma transação de outra origem.",
  diferenca_de_valor: "Conferir o valor real cobrado — pode indicar erro de digitação, troco, ou taxa aplicada de forma inesperada.",
  diferenca_forma_pagamento: "Conferir qual forma de pagamento foi realmente utilizada.",
  diferenca_parcelamento: "Conferir a quantidade de parcelas realmente combinada com o cliente.",
  possivel_duplicidade: "Conferir se houve cobrança em dobro antes de qualquer estorno ao cliente.",
  cancelamento_nao_refletido_internamente: "Atualizar o registro interno para refletir o cancelamento/reversão já ocorrido na Stone.",
  estorno: "Conferir o motivo do estorno e se o cliente já foi comunicado.",
  chargeback: "Conferir o motivo do chargeback junto à Stone e reunir evidências, se aplicável.",
  correspondencia_ambigua: "Revisar manualmente os candidatos — nunca escolher automaticamente entre eles.",
  arquivo_stone_ausente_ou_defasado: "Aguardar a publicação do arquivo (janela oficial de até 29h) antes de tratar como erro.",
};

function buildFromReconciliation(result: ReconciliationResult): Divergence | null {
  const type = RECONCILIATION_TYPE_MAP[result.type];
  if (!type) return null;
  const amount = result.stoneSale?.amount ?? result.jumpparkOrder?.amount ?? 0;
  return {
    type,
    priority: PRIORITY_BY_TYPE[type],
    evidence: [...result.favorableSignals.map((s) => `favorável: ${s}`), ...result.contrarySignals.map((s) => `contrário: ${s}`)],
    financialImpact: Math.abs(amount),
    involvedRecords: { jumpparkOrderRef: result.jumpparkOrder?.externalReference ?? null, stoneSaleRef: result.stoneSale?.externalReference ?? null },
    confidence: result.confidence,
    reviewRecommendation: RECOMMENDATION_BY_TYPE[type],
    status: "identificado",
  };
}

/** Uma divergência por resultado de conciliação que representa um problema real — `exact_match`/`probable_match`/`date_mismatch`/`pending_processing` nunca geram divergência. */
export function deriveDivergencesFromReconciliation(results: ReconciliationResult[]): Divergence[] {
  return results.map(buildFromReconciliation).filter((d): d is Divergence => d !== null);
}

/** Chargebacks e estornos são sempre dignos de conferência, independente de terem sido casados com o JumpPark ou não — vêm direto do dado normalizado da Stone. */
export function deriveDivergencesFromConciliationDays(days: NormalizedConciliation[]): Divergence[] {
  const divergences: Divergence[] = [];
  for (const day of days) {
    for (const cb of day.chargebacks) {
      divergences.push({
        type: "chargeback",
        priority: PRIORITY_BY_TYPE.chargeback,
        evidence: [`chargeback ${cb.id} em ${cb.occurredAt}, parcela ${cb.installmentNumber}`],
        financialImpact: Math.abs(cb.amount),
        involvedRecords: { jumpparkOrderRef: null, stoneSaleRef: cb.saleExternalReference },
        confidence: "high",
        reviewRecommendation: RECOMMENDATION_BY_TYPE.chargeback,
        status: "identificado",
      });
    }
    for (const refund of day.chargebackRefunds) {
      divergences.push({
        type: "estorno",
        priority: PRIORITY_BY_TYPE.estorno,
        evidence: [`estorno de chargeback ${refund.id} em ${refund.occurredAt}, parcela ${refund.installmentNumber}`],
        financialImpact: Math.abs(refund.amount),
        involvedRecords: { jumpparkOrderRef: null, stoneSaleRef: refund.saleExternalReference },
        confidence: "high",
        reviewRecommendation: RECOMMENDATION_BY_TYPE.estorno,
        status: "identificado",
      });
    }
  }
  return divergences;
}

/** Dias dentro da janela pedida cujo arquivo não pôde ser obtido (`no_data`/`temporary_failure`/etc.) — nunca silenciado, sempre visível como algo a conferir depois. */
export function deriveDivergencesFromDayFetchResults(dayResults: DayFetchResult[]): Divergence[] {
  return dayResults
    .filter((r) => r.status !== "ok")
    .map((r) => ({
      type: "arquivo_stone_ausente_ou_defasado" as const,
      priority: PRIORITY_BY_TYPE.arquivo_stone_ausente_ou_defasado,
      evidence: [`${r.referenceDate}: status ${r.status}${r.error ? ` — ${r.error}` : ""}`],
      financialImpact: 0,
      involvedRecords: { jumpparkOrderRef: null, stoneSaleRef: null },
      confidence: "low" as const,
      reviewRecommendation: RECOMMENDATION_BY_TYPE.arquivo_stone_ausente_ou_defasado,
      status: "identificado" as const,
    }));
}
