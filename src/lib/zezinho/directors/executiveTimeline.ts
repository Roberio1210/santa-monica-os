import type { ConversationTurn, ConversationalMemory, ExecutiveTimeline, TimelineEntry } from "@/lib/zezinho/directors/types";

/**
 * Executive Timeline (Sprint 5.0, Z3A, novo componente, decisão do usuário) — "estrutura capaz de
 * resumir: últimos dias, mudanças, tendências, acontecimentos importantes. Ainda sem persistência,
 * apenas arquitetura." Sem um banco de observações diárias (isso é o Z3B), a única fonte real
 * disponível hoje é a própria `ConversationalMemory` da sessão, agrupada por dia. A MESMA forma
 * (`TimelineEntry`) será alimentada por dado persistido real quando o Z3B existir, sem precisar
 * ser redesenhada.
 */

const MIN_ENTRIES_FOR_TREND = 3;

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

function turnsByDate(memory: ConversationalMemory): Map<string, ConversationTurn[]> {
  const map = new Map<string, ConversationTurn[]>();
  for (const turn of memory.turns) {
    const date = dateOf(turn.askedAt);
    const existing = map.get(date);
    if (existing) existing.push(turn);
    else map.set(date, [turn]);
  }
  return map;
}

function summaryFor(date: string, turns: ConversationTurn[]): string {
  const questionLabel = turns.length === 1 ? "1 pergunta" : `${turns.length} perguntas`;
  const lastTurn = turns[turns.length - 1];
  if (lastTurn.decisions?.whatIWouldDoFirst) {
    return `${date}: ${questionLabel} — prioridade do dia foi "${lastTurn.decisions.whatIWouldDoFirst.action}".`;
  }
  return `${date}: ${questionLabel}, sem uma prioridade consolidada nesse dia.`;
}

/** Só hipóteses de alta confiança e planos de prioridade alta — nunca todo o volume do dia (mesma disciplina de "nunca mostrar todos os N alertas"). */
function importantEventsFor(turns: ConversationTurn[]): string[] {
  const events: string[] = [];
  const seen = new Set<string>();
  for (const turn of turns) {
    for (const hypothesis of turn.hypotheses) {
      if (hypothesis.confidenceLevel !== "alta" || seen.has(hypothesis.description)) continue;
      seen.add(hypothesis.description);
      events.push(`Hipótese de alta confiança: ${hypothesis.description}`);
    }
    for (const plan of turn.actionPlans) {
      if (plan.priority !== "alta" || seen.has(plan.id)) continue;
      seen.add(plan.id);
      events.push(`Plano de alta prioridade: ${plan.action}`);
    }
  }
  return events;
}

/**
 * Diferença real entre dois turnos — só o que é NOVO no turno atual em relação ao anterior, nunca
 * uma lista repetida do que já existia. Comparação por descrição/ação (mesma chave usada pelo
 * dedupe de `conversationalMemory.ts`), não por identidade de objeto.
 */
export function computeChanges(previous: ConversationTurn, current: ConversationTurn): string[] {
  const previousHypotheses = new Set(previous.hypotheses.map((h) => h.description));
  const previousRecommendations = new Set(previous.recommendations.map((r) => r.action));

  const changes: string[] = [];
  for (const hypothesis of current.hypotheses) {
    if (!previousHypotheses.has(hypothesis.description)) changes.push(`Nova hipótese: ${hypothesis.description}`);
  }
  for (const recommendation of current.recommendations) {
    if (!previousRecommendations.has(recommendation.action)) changes.push(`Nova recomendação: ${recommendation.action}`);
  }
  return changes;
}

function buildEntry(date: string, turns: ConversationTurn[], previousLastTurn: ConversationTurn | null): TimelineEntry {
  const lastTurn = turns[turns.length - 1];
  const changes = previousLastTurn ? computeChanges(previousLastTurn, lastTurn) : [];
  return { date, summary: summaryFor(date, turns), changes, importantEvents: importantEventsFor(turns) };
}

/**
 * Tendência real exige histórico mínimo — abaixo disso, honestidade explícita em vez de "inventar"
 * uma tendência a partir de 1-2 dias (mesma disciplina de `historical-pattern.ts`, Sprint 4.0/Z2).
 * Cada frase devolvida é uma contagem real sobre `entries`, nunca uma extrapolação.
 */
export function computeTrends(entries: TimelineEntry[]): string[] {
  if (entries.length < MIN_ENTRIES_FOR_TREND) {
    return ["Ainda não há dias suficientes nesta conversa para apontar uma tendência (mínimo de 3)."];
  }

  const trends: string[] = [];
  const daysWithChanges = entries.filter((e) => e.changes.length > 0).length;
  if (daysWithChanges === entries.length) {
    trends.push("Todos os dias registrados nesta conversa trouxeram novidades (novas hipóteses ou recomendações).");
  } else if (daysWithChanges === 0) {
    trends.push("Nenhum dia registrado nesta conversa trouxe novidades além do primeiro — mesmas hipóteses e recomendações se repetindo.");
  }

  const daysWithImportantEvents = entries.filter((e) => e.importantEvents.length > 0).length;
  if (daysWithImportantEvents >= Math.ceil(entries.length / 2)) {
    trends.push("Acontecimentos importantes (hipóteses de alta confiança ou planos de alta prioridade) apareceram na maioria dos dias desta conversa.");
  }

  if (trends.length === 0) trends.push("Nenhum padrão claro identificado nos dias recentes desta conversa.");
  return trends;
}

export function buildExecutiveTimeline(memory: ConversationalMemory): ExecutiveTimeline {
  const grouped = Array.from(turnsByDate(memory).entries()).sort(([a], [b]) => a.localeCompare(b));

  const entries: TimelineEntry[] = [];
  let previousLastTurn: ConversationTurn | null = null;
  for (const [date, turns] of grouped) {
    entries.push(buildEntry(date, turns, previousLastTurn));
    previousLastTurn = turns[turns.length - 1];
  }

  return { entries, trends: computeTrends(entries) };
}
