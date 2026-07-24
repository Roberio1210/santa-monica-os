import type { ActionPlan, DirectorId } from "@/lib/zezinho/directors/types";
import type { Recommendation } from "@/lib/zezinho/reasoning/types";

/**
 * Plano de Ação (Sprint 5.0, Z2 — decisão do usuário). Só a arquitetura nesta checkpoint,
 * nenhuma persistência: todo plano nasce `identificado`, `responsible` sempre `null` (nenhum
 * módulo de RH/equipe real existe ainda) e `suggestedDeadline` sempre `null` (nenhuma base real
 * para estimar prazo — nunca um prazo inventado). Um `ActionPlan` por `Recommendation`, nunca
 * menos informativo que a recomendação que o originou.
 */

/** Estável dentro da mesma execução — sem persistência ainda, não precisa ser globalmente único entre execuções. */
function buildId(directorId: DirectorId, index: number, action: string): string {
  const slug = action
    .toLowerCase()
    .slice(0, 24)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${directorId}-plan-${index}-${slug}`;
}

export function buildActionPlan(directorId: DirectorId, recommendation: Recommendation, index: number): ActionPlan {
  return {
    id: buildId(directorId, index, recommendation.action),
    status: "identificado",
    action: recommendation.action,
    reason: recommendation.reason,
    priority: recommendation.priority,
    responsible: null,
    expectedImpact: `Se aplicado, o efeito esperado deve aparecer em: ${recommendation.howToVerify}`,
    suggestedDeadline: null,
    evidenceFactKeys: recommendation.evidenceFactKeys,
  };
}

export function buildActionPlans(directorId: DirectorId, recommendations: Recommendation[]): ActionPlan[] {
  return recommendations.map((r, i) => buildActionPlan(directorId, r, i));
}
