import type { PaymentMethod } from "@/types/common";
import type { NormalizedCardFlow, NormalizedSaleTransaction } from "@/lib/integrations/stone/normalize";

/**
 * Conciliação Stone × JumpPark (Sprint 7.0, Z3, decisão do usuário) — capacidade do Diretor
 * Financeiro, função pura (nenhum I/O aqui — quem busca dado é `multiDay.ts`/JumpPark já
 * existente). Auditoria honesta antes de desenhar: o JumpPark (`integrations/jumppark/types.ts`)
 * **não registra** NSU, código de autorização, bandeira, quantidade/número de parcela nem
 * terminal — só `serviceOrderId`/`serviceOrderCode`, `exitDateTime`, `totalAmount` e
 * `paymentMethodName`. Por isso `exact_match` só é alcançável quando `InitiatorTransactionKey`
 * (Stone) coincide com o identificador do pedido JumpPark — um vínculo arquiteturalmente pronto,
 * mas cuja ocorrência real depende de uma configuração do terminal Stone não confirmada neste
 * checkpoint (limitação sempre declarada). Na prática, `probable_match` (valor + horário + forma
 * de pagamento) é o mecanismo real disponível hoje.
 *
 * Só pedidos JumpPark pagos em cartão (débito/crédito) entram na conciliação — dinheiro e PIX não
 * passam pela adquirente Stone, nunca são tratados como divergência por não aparecerem lá.
 */

export type ReconciliationMatchType =
  | "exact_match"
  | "probable_match"
  | "ambiguous"
  | "unmatched_jumppark"
  | "unmatched_stone"
  | "value_mismatch"
  | "payment_method_mismatch"
  | "installment_mismatch"
  | "date_mismatch"
  | "duplicate"
  | "reversed"
  | "pending_processing";

export type MatchConfidenceLevel = "high" | "medium" | "low";

export interface JumpparkOrderForReconciliation {
  externalReference: string;
  occurredAt: string;
  amount: number;
  paymentMethod: PaymentMethod;
  /** Sempre `null` com o modelo de dado real do JumpPark hoje — o campo existe para não precisar redesenhar quando/se essa informação passar a existir. */
  expectedInstallments: number | null;
}

export interface ReconciliationStoneSaleRef {
  externalReference: string;
  amount: number;
  occurredAt: string;
  paymentMethod: PaymentMethod;
}

export interface ReconciliationResult {
  type: ReconciliationMatchType;
  confidence: MatchConfidenceLevel;
  /** Score heurístico interno, só para ordenar candidatos — NUNCA uma probabilidade estatística (decisão do usuário, seção 6). */
  heuristicScore: number;
  favorableSignals: string[];
  contrarySignals: string[];
  limitations: string[];
  ruleApplied: string;
  comparedFields: string[];
  jumpparkOrder: JumpparkOrderForReconciliation | null;
  stoneSale: ReconciliationStoneSaleRef | null;
}

const TIME_TOLERANCE_MINUTES = 90;
const VALUE_TOLERANCE_CENTS = 1;
/** Arquivo do dia D só disponível a partir de 5h do dia D+1 (documentação oficial, seção 1.2 do documento de arquitetura) — nunca menos de 29h de tolerância antes de considerar "não encontrado" um erro real. */
export const FILE_PROCESSING_LAG_HOURS = 29;
const AMBIGUOUS_SCORE_GAP = 5;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isCardPayment(method: PaymentMethod): boolean {
  return method === "debito" || method === "credito";
}

function mapCardFlowToPaymentMethod(flow: NormalizedCardFlow): PaymentMethod {
  if (flow === "debito") return "debito";
  if (flow === "credito") return "credito";
  return "outro";
}

function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

function valuesMatch(centsA: number, centsB: number): boolean {
  return Math.abs(centsA - centsB) <= VALUE_TOLERANCE_CENTS;
}

function toStoneSaleRef(sale: NormalizedSaleTransaction): ReconciliationStoneSaleRef {
  return { externalReference: sale.acquirerTransactionKey, amount: sale.grossAmount, occurredAt: sale.capturedAt, paymentMethod: mapCardFlowToPaymentMethod(sale.cardFlow) };
}

function strongIdentifierMatches(sale: NormalizedSaleTransaction, order: JumpparkOrderForReconciliation): boolean {
  return sale.raw.initiatorTransactionKey !== null && sale.raw.initiatorTransactionKey === order.externalReference;
}

/** `true` quando o pedido JumpPark ainda está dentro da defasagem oficial de publicação do arquivo Stone — "não encontrado ainda" é esperado, nunca um erro. */
export function withinProcessingWindow(occurredAtIso: string, now: Date): boolean {
  const hoursSince = (now.getTime() - new Date(occurredAtIso).getTime()) / (1000 * 60 * 60);
  return hoursSince < FILE_PROCESSING_LAG_HOURS;
}

interface ScoredCandidate {
  sale: NormalizedSaleTransaction;
  score: number;
  favorable: string[];
  contrary: string[];
}

function scoreCandidate(sale: NormalizedSaleTransaction, order: JumpparkOrderForReconciliation): ScoredCandidate {
  const favorable: string[] = [];
  const contrary: string[] = [];
  let score = 0;

  if (valuesMatch(toCents(sale.grossAmount), toCents(order.amount))) {
    score += 50;
    favorable.push("valor compatível");
  } else {
    contrary.push("valor divergente");
  }

  const minutesDiff = minutesBetween(sale.capturedAt, order.occurredAt);
  if (minutesDiff <= 15) {
    score += 30;
    favorable.push("horário muito próximo (≤15min)");
  } else if (minutesDiff <= TIME_TOLERANCE_MINUTES) {
    score += 15;
    favorable.push(`horário dentro da janela de tolerância (${TIME_TOLERANCE_MINUTES}min)`);
  } else {
    contrary.push("horário fora da janela de tolerância");
  }

  if (mapCardFlowToPaymentMethod(sale.cardFlow) === order.paymentMethod) {
    score += 20;
    favorable.push("forma de pagamento compatível");
  } else {
    contrary.push("forma de pagamento divergente");
  }

  return { sale, score, favorable, contrary };
}

function hasReversal(sale: NormalizedSaleTransaction, chargedBackSaleRefs: ReadonlySet<string>): boolean {
  return sale.cancellations.length > 0 || chargedBackSaleRefs.has(sale.acquirerTransactionKey);
}

/**
 * Motor de correspondência, em estágios explicáveis (nunca uma pontuação obscura de decisão
 * final — o `heuristicScore` só ordena candidatos, quem decide o `type` são regras discretas):
 *
 * 1. Identificador forte (`InitiatorTransactionKey` === referência JumpPark) — `exact_match`
 *    quando único e valor bate; `ambiguous` quando mais de um candidato compartilha o mesmo
 *    identificador (nunca deveria acontecer, mas nunca escondido se acontecer).
 * 2. Sinais combinados (valor + horário + forma de pagamento) para o que sobrou —
 *    `probable_match` quando os três batem; `value_mismatch`/`payment_method_mismatch`/
 *    `date_mismatch`/`installment_mismatch` quando um candidato plausível existe mas diverge num
 *    campo específico; `ambiguous` quando dois candidatos têm pontuação heurística equivalente;
 *    `pending_processing` quando nenhum candidato existe mas o pedido ainda está dentro da janela
 *    de defasagem oficial da Stone; `unmatched_jumppark` só depois dessa janela.
 * 3. Vendas Stone nunca usadas por nenhum pedido JumpPark — `unmatched_stone`.
 * 4. Vendas Stone duplicadas entre si (mesmo valor, minuto e forma) — `duplicate`, um sinal de
 *    possível cobrança em dobro, nunca corrigido automaticamente.
 */
export function reconcileStoneWithJumppark(jumpparkOrders: JumpparkOrderForReconciliation[], stoneSales: NormalizedSaleTransaction[], chargedBackSaleRefs: ReadonlySet<string>, now: Date): ReconciliationResult[] {
  const results: ReconciliationResult[] = [];
  const usedStoneKeys = new Set<string>();
  const resolvedOrderRefs = new Set<string>();

  const cardOrders = jumpparkOrders.filter((o) => isCardPayment(o.paymentMethod));

  for (const order of cardOrders) {
    const strongCandidates = stoneSales.filter((s) => !usedStoneKeys.has(s.acquirerTransactionKey) && strongIdentifierMatches(s, order));
    if (strongCandidates.length === 0) continue;

    if (strongCandidates.length > 1) {
      results.push({
        type: "ambiguous",
        confidence: "low",
        heuristicScore: 0,
        favorableSignals: ["identificador forte presente"],
        contrarySignals: ["mais de uma venda Stone compartilha o mesmo identificador"],
        limitations: ["Correspondência ambígua nunca deve ser tratada como certeza — exige conferência manual."],
        ruleApplied: "identificador forte (InitiatorTransactionKey) — múltiplos candidatos",
        comparedFields: ["initiatorTransactionKey"],
        jumpparkOrder: order,
        stoneSale: null,
      });
      resolvedOrderRefs.add(order.externalReference);
      continue;
    }

    const sale = strongCandidates[0];
    usedStoneKeys.add(sale.acquirerTransactionKey);
    resolvedOrderRefs.add(order.externalReference);

    if (hasReversal(sale, chargedBackSaleRefs)) {
      results.push(buildResult("reversed", "medium", 0, ["identificador forte compatível"], ["venda Stone tem cancelamento/chargeback associado"], "identificador forte + reversão detectada", ["initiatorTransactionKey", "cancellations", "chargebacks"], order, sale));
      continue;
    }

    const valueOk = valuesMatch(toCents(sale.grossAmount), toCents(order.amount));
    if (valueOk) {
      results.push(buildResult("exact_match", "high", 100, ["identificador forte compatível", "valor compatível"], [], "identificador forte (InitiatorTransactionKey) + valor", ["initiatorTransactionKey", "amount"], order, sale));
    } else {
      results.push(buildResult("value_mismatch", "medium", 50, ["identificador forte compatível"], ["valor divergente"], "identificador forte com valor divergente", ["initiatorTransactionKey", "amount"], order, sale));
    }
  }

  for (const order of cardOrders) {
    if (resolvedOrderRefs.has(order.externalReference)) continue;

    const candidates = stoneSales
      .filter((s) => !usedStoneKeys.has(s.acquirerTransactionKey))
      .map((s) => scoreCandidate(s, order))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      if (withinProcessingWindow(order.occurredAt, now)) {
        results.push(buildResult("pending_processing", "low", 0, [], ["nenhuma venda Stone correspondente encontrada ainda"], `dentro da janela de defasagem oficial (${FILE_PROCESSING_LAG_HOURS}h) — ainda não deve ser tratado como erro`, ["occurredAt"], order, null));
      } else {
        results.push(buildResult("unmatched_jumppark", "low", 0, [], ["nenhuma venda Stone correspondente encontrada, mesmo fora da janela de defasagem"], "sem candidato após a janela de defasagem oficial", ["occurredAt"], order, null));
      }
      continue;
    }

    const [top, second] = candidates;
    if (second && Math.abs(top.score - second.score) < AMBIGUOUS_SCORE_GAP) {
      results.push({
        type: "ambiguous",
        confidence: "low",
        heuristicScore: top.score,
        favorableSignals: top.favorable,
        contrarySignals: [...top.contrary, "outro candidato com pontuação heurística equivalente"],
        limitations: ["Dois ou mais candidatos plausíveis — correspondência ambígua nunca deve ser tratada como certeza, exige conferência manual."],
        ruleApplied: "sinais combinados — múltiplos candidatos com pontuação equivalente",
        comparedFields: ["amount", "occurredAt", "paymentMethod"],
        jumpparkOrder: order,
        stoneSale: null,
      });
      continue;
    }

    usedStoneKeys.add(top.sale.acquirerTransactionKey);

    if (hasReversal(top.sale, chargedBackSaleRefs)) {
      results.push(buildResult("reversed", "medium", top.score, top.favorable, [...top.contrary, "venda Stone tem cancelamento/chargeback associado"], "sinais combinados + reversão detectada", ["amount", "occurredAt", "paymentMethod", "cancellations", "chargebacks"], order, top.sale));
      continue;
    }

    const valueOk = valuesMatch(toCents(top.sale.grossAmount), toCents(order.amount));
    const methodOk = mapCardFlowToPaymentMethod(top.sale.cardFlow) === order.paymentMethod;
    const dateOk = minutesBetween(top.sale.capturedAt, order.occurredAt) <= TIME_TOLERANCE_MINUTES;
    const installmentsOk = order.expectedInstallments === null || order.expectedInstallments === top.sale.installmentsCount;

    if (valueOk && methodOk && dateOk && installmentsOk) {
      const confidence: MatchConfidenceLevel = top.score >= 90 ? "high" : top.score >= 60 ? "medium" : "low";
      results.push(buildResult("probable_match", confidence, top.score, top.favorable, top.contrary, "sinais combinados (valor + horário + forma de pagamento)", ["amount", "occurredAt", "paymentMethod"], order, top.sale));
    } else if (!valueOk) {
      results.push(buildResult("value_mismatch", "medium", top.score, top.favorable, top.contrary, "melhor candidato disponível, valor diverge", ["amount"], order, top.sale));
    } else if (!methodOk) {
      results.push(buildResult("payment_method_mismatch", "medium", top.score, top.favorable, top.contrary, "melhor candidato disponível, forma de pagamento diverge", ["paymentMethod"], order, top.sale));
    } else if (!dateOk) {
      results.push(buildResult("date_mismatch", "low", top.score, top.favorable, top.contrary, "melhor candidato disponível, horário fora da janela de tolerância", ["occurredAt"], order, top.sale));
    } else {
      results.push(buildResult("installment_mismatch", "low", top.score, top.favorable, top.contrary, "melhor candidato disponível, quantidade de parcelas diverge", ["installments"], order, top.sale));
    }
  }

  for (const sale of stoneSales) {
    if (usedStoneKeys.has(sale.acquirerTransactionKey)) continue;
    results.push(buildResult("unmatched_stone", "low", 0, [], ["nenhum pedido JumpPark correspondente encontrado"], "venda Stone sem contraparte JumpPark", ["amount", "occurredAt", "paymentMethod"], null, sale));
  }

  results.push(...detectDuplicateStoneSales(stoneSales));

  return results;
}

function buildResult(
  type: ReconciliationMatchType,
  confidence: MatchConfidenceLevel,
  heuristicScore: number,
  favorableSignals: string[],
  contrarySignals: string[],
  ruleApplied: string,
  comparedFields: string[],
  order: JumpparkOrderForReconciliation | null,
  sale: NormalizedSaleTransaction | null,
): ReconciliationResult {
  const limitations = type === "probable_match" ? ["Correspondência provável (sem identificador forte) — nunca deve ser tratada como certeza."] : [];
  return { type, confidence, heuristicScore, favorableSignals, contrarySignals, limitations, ruleApplied, comparedFields, jumpparkOrder: order, stoneSale: sale ? toStoneSaleRef(sale) : null };
}

/** Vendas Stone com mesmo valor, mesmo minuto de captura e mesma forma de pagamento — possível cobrança em dobro. Nunca corrigido automaticamente, só sinalizado. */
function detectDuplicateStoneSales(stoneSales: NormalizedSaleTransaction[]): ReconciliationResult[] {
  const seen = new Map<string, NormalizedSaleTransaction>();
  const duplicates: ReconciliationResult[] = [];
  for (const sale of stoneSales) {
    const minuteKey = sale.capturedAt.slice(0, 16); // corta os segundos — "mesmo minuto"
    const key = `${toCents(sale.grossAmount)}|${minuteKey}|${sale.cardFlow}`;
    const original = seen.get(key);
    if (original && original.acquirerTransactionKey !== sale.acquirerTransactionKey) {
      duplicates.push({
        type: "duplicate",
        confidence: "medium",
        heuristicScore: 0,
        favorableSignals: ["mesmo valor, mesmo minuto de captura, mesma forma de pagamento"],
        contrarySignals: ["identificadores de transação diferentes"],
        limitations: ["Possível duplicidade — exige conferência manual antes de qualquer ação, nunca uma correção automática."],
        ruleApplied: "vendas Stone com valor+minuto+forma de pagamento idênticos",
        comparedFields: ["amount", "capturedAt", "cardFlow"],
        jumpparkOrder: null,
        stoneSale: toStoneSaleRef(sale),
      });
    } else {
      seen.set(key, sale);
    }
  }
  return duplicates;
}
