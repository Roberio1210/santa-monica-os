import type { PeriodRange } from "@/lib/utils/timezone";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";

/**
 * Resolução de período — extraída do antigo planejador de objetivo único (Sprint 3.0/Z2,
 * `selectTools.ts`), que foi removido na Z4 junto com o resto da lógica antiga baseada em
 * intenção única + switch rígido (ver `intent/classify.ts`, `objective/infer.ts`,
 * `reasoning/reason.ts`, `narrator/narrate.ts` — todos removidos; o fluxo vivo agora é
 * `planner/managerialPlan.ts` -> `narrator/narrateManagerialPlan.ts`). Esta regra de resolução de
 * período continua sendo a mesma e é usada por `planner/contextBuilder.ts`.
 */
export interface ResolvedPeriods {
  periodA: PeriodRange;
  periodB: PeriodRange | null;
}

/** Entidade nova da mensagem atual > memória da sessão > nenhum (honesto, nunca um padrão inventado). */
export function resolvePeriods(entities: ExtractedEntities, memory: ReasoningSession): ResolvedPeriods | null {
  if (entities.comparison) return { periodA: entities.comparison.periodA, periodB: entities.comparison.periodB };
  if (entities.singlePeriod) return { periodA: entities.singlePeriod, periodB: null };
  if (memory.activePeriodA) return { periodA: memory.activePeriodA, periodB: memory.activePeriodB };
  return null;
}
