import type { PeriodRange } from "@/lib/utils/timezone";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";

/**
 * Funções puras de atualização da sessão — nunca mutam o objeto recebido, sempre devolvem uma
 * nova sessão. Usadas pelo orquestrador do pipeline (a partir de Z2/Z3) para ir compondo o
 * `nextContext` devolvido ao cliente a cada resposta.
 */

/** Atualiza período/filtro/objetivo ativos após uma nova análise. */
export function withActiveAnalysis(
  session: ReasoningSession,
  update: { periodA: PeriodRange | null; periodB: PeriodRange | null; areaFilter?: "lavacao" | "estacionamento" | null; objective: BusinessObjective | null },
): ReasoningSession {
  return {
    ...session,
    activePeriodA: update.periodA,
    activePeriodB: update.periodB,
    activeAreaFilter: update.areaFilter ?? session.activeAreaFilter,
    activeObjective: update.objective,
  };
}

/** Registra o resumo de um achado já apresentado, sem duplicar se o mesmo resumo já estiver lá. */
export function withInsightSummary(session: ReasoningSession, summary: string): ReasoningSession {
  if (session.lastInsightSummaries.includes(summary)) return session;
  return { ...session, lastInsightSummaries: [...session.lastInsightSummaries, summary] };
}

/** Marca uma métrica como já explicada nesta sessão, sem duplicar. */
export function withExplainedMetric(session: ReasoningSession, metricKey: string): ReasoningSession {
  if (session.explainedMetricKeys.includes(metricKey)) return session;
  return { ...session, explainedMetricKeys: [...session.explainedMetricKeys, metricKey] };
}

/** `true` quando a métrica já foi explicada nesta sessão — usado pelo narrador (Z4) para não repetir. */
export function wasMetricExplained(session: ReasoningSession, metricKey: string): boolean {
  return session.explainedMetricKeys.includes(metricKey);
}

/** Registra uma abertura de narração como usada, sem duplicar. */
export function withUsedOpener(session: ReasoningSession, opener: string): ReasoningSession {
  if (session.usedNarrationOpeners.includes(opener)) return session;
  return { ...session, usedNarrationOpeners: [...session.usedNarrationOpeners, opener] };
}
