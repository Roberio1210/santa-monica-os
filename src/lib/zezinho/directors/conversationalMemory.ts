import type { ActionPlan, ConsolidatedReport, ConversationTurn, ConversationalMemory, Hypothesis, ReviewedHypothesis } from "@/lib/zezinho/directors/types";
import type { Recommendation } from "@/lib/zezinho/reasoning/types";

/**
 * Memória Conversacional Gerencial (Sprint 5.0, Z3A, decisão do usuário) — "o Zézinho deve manter
 * contexto durante toda a conversa... essa memória dura apenas durante a conversa. Não deve ser
 * persistida." Mesmo espírito de `memory/session.ts` (funções puras, nunca mutam, sempre devolvem
 * uma nova memória) — client-held, passada a cada requisição pelo mesmo mecanismo que já existe
 * para `ReasoningSession`. Nenhuma escrita em banco nasce aqui.
 */

export const EMPTY_CONVERSATIONAL_MEMORY: ConversationalMemory = { turns: [] };

/**
 * Limite de segurança (não uma decisão de produto) — evita crescimento sem fim do payload
 * client-held numa conversa muito longa. Mantém sempre os turnos mais recentes.
 */
const MAX_TURNS = 20;

function reviewedToHypothesis(h: ReviewedHypothesis): Hypothesis {
  return { description: h.description, evidenceFactKeys: h.evidenceFactKeys, contraryEvidenceFactKeys: h.contraryEvidenceFactKeys, basis: h.basis, confidenceScore: h.confidenceScore, confidenceLevel: h.confidenceLevel, limitations: h.limitations };
}

/** Constrói o turno a partir do que a Diretoria concluiu para a pergunta — nunca um cálculo novo, só a leitura do `ConsolidatedReport` já pronto. */
export function buildTurnFromConsolidatedReport(question: string, consolidated: ConsolidatedReport, askedAt: string = new Date().toISOString()): ConversationTurn {
  return {
    askedAt,
    question,
    hypotheses: consolidated.reviewedHypotheses.map(reviewedToHypothesis),
    decisions: consolidated.decisions,
    recommendations: consolidated.recommendations,
    actionPlans: consolidated.actionPlans,
  };
}

/** Adiciona um turno, respeitando o limite de segurança — nunca muta a memória recebida. */
export function withTurn(memory: ConversationalMemory, turn: ConversationTurn): ConversationalMemory {
  const turns = [...memory.turns, turn].slice(-MAX_TURNS);
  return { turns };
}

/** Últimas perguntas feitas na conversa, mais recente primeiro — usado para o narrador não repetir o que acabou de responder. */
export function recentQuestions(memory: ConversationalMemory, limit = 5): string[] {
  return memory.turns.slice(-limit).reverse().map((t) => t.question);
}

/** `true` quando uma hipótese com a mesma descrição já foi levantada em algum turno anterior. */
export function wasHypothesisAlreadyDiscussed(memory: ConversationalMemory, description: string): boolean {
  return memory.turns.some((t) => t.hypotheses.some((h) => h.description === description));
}

/** `true` quando uma recomendação com a mesma ação já foi dada em algum turno anterior — evita o narrador soar repetitivo dentro da mesma conversa. */
export function wasRecommendationAlreadyGiven(memory: ConversationalMemory, action: string): boolean {
  return memory.turns.some((t) => t.recommendations.some((r) => r.action === action));
}

/** Todas as hipóteses já discutidas na conversa, sem duplicar por descrição — material bruto para o Executive Timeline. */
export function allHypothesesDiscussed(memory: ConversationalMemory): Hypothesis[] {
  const seen = new Set<string>();
  const result: Hypothesis[] = [];
  for (const turn of memory.turns) {
    for (const hypothesis of turn.hypotheses) {
      if (seen.has(hypothesis.description)) continue;
      seen.add(hypothesis.description);
      result.push(hypothesis);
    }
  }
  return result;
}

/** Todas as recomendações já dadas na conversa, sem duplicar por ação. */
export function allRecommendationsGiven(memory: ConversationalMemory): Recommendation[] {
  const seen = new Set<string>();
  const result: Recommendation[] = [];
  for (const turn of memory.turns) {
    for (const recommendation of turn.recommendations) {
      if (seen.has(recommendation.action)) continue;
      seen.add(recommendation.action);
      result.push(recommendation);
    }
  }
  return result;
}

/** Todos os planos de ação já sugeridos na conversa, sem duplicar por id. */
export function allActionPlansSuggested(memory: ConversationalMemory): ActionPlan[] {
  const seen = new Set<string>();
  const result: ActionPlan[] = [];
  for (const turn of memory.turns) {
    for (const plan of turn.actionPlans) {
      if (seen.has(plan.id)) continue;
      seen.add(plan.id);
      result.push(plan);
    }
  }
  return result;
}
