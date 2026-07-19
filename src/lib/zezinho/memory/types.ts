import type { PeriodRange } from "@/lib/utils/timezone";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";

/**
 * Estado de raciocínio da sessão (Etapa "memória" — ver docs/zezinho-3.0-architecture.md, seção
 * 9). Substitui/expande o `ZezinhoContext` da Sprint 2.0: além de período/filtro ativos, guarda o
 * objetivo da última análise (para `recommend` sem entidade nova reaproveitar em vez de
 * reinferir) e o que já foi dito nesta conversa (para nunca repetir uma análise ou explicar a
 * mesma métrica duas vezes).
 *
 * Continua sendo estado só do cliente (nunca persistido no servidor) — mesma garantia de
 * privacidade já estabelecida na Sprint 2.0. Nesta etapa (Z1) o tipo ainda não substitui o
 * `ZezinhoContext` usado pela conversa em produção — isso só acontece na integração final (Z4),
 * quando o pipeline inteiro estiver pronto e testado ponta a ponta.
 */
export interface ReasoningSession {
  activePeriodA: PeriodRange | null;
  activePeriodB: PeriodRange | null;
  activeAreaFilter: "lavacao" | "estacionamento" | null;
  /** Objetivo inferido na última análise — permite que "o que você faria?" reaproveite em vez de reinferir do zero. */
  activeObjective: BusinessObjective | null;
  /** Resumos curtos dos achados já apresentados nesta sessão (Etapa 4, a partir de Z3) — evita repetir a mesma análise. */
  lastInsightSummaries: string[];
  /** Chaves de métricas já explicadas nesta sessão (ex.: "avgTicket") — evita reexplicar o mesmo número. */
  explainedMetricKeys: string[];
  /** Aberturas de narração já usadas nesta sessão (Etapa 5, a partir de Z4) — evita repetir a mesma forma de começar a frase. */
  usedNarrationOpeners: string[];
}

export const EMPTY_REASONING_SESSION: ReasoningSession = {
  activePeriodA: null,
  activePeriodB: null,
  activeAreaFilter: null,
  activeObjective: null,
  lastInsightSummaries: [],
  explainedMetricKeys: [],
  usedNarrationOpeners: [],
};

/** `true` quando a sessão já tem uma análise anterior para uma pergunta de acompanhamento reaproveitar. */
export function hasActiveAnalysis(session: ReasoningSession): boolean {
  return session.activePeriodA !== null;
}
