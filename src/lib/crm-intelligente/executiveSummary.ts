import type { CustomerProfile, ExecutiveSummary, SmartRecommendation } from "@/lib/crm-intelligente/types";

/** "Resumo Executivo" (Missão 21) — puro, monta o painel do topo a partir do que já foi calculado (perfil, proteções, recomendações). Nunca recalcula nada por conta própria. */
export function buildExecutiveSummary(params: { profile: CustomerProfile; activeProtectionsCount: number; recommendations: SmartRecommendation[] }): ExecutiveSummary {
  const { profile, activeProtectionsCount, recommendations } = params;
  return {
    customerSince: profile.firstVisitAt,
    lastVisitAt: profile.lastVisitAt,
    daysSinceLastVisit: profile.daysSinceLastVisit,
    totalSpent: profile.totalSpent,
    averageTicket: profile.averageTicket,
    vehicleCount: profile.vehicleCount,
    visitCount: profile.visitCount,
    activeProtectionsCount,
    nextRecommendation: recommendations[0]?.reason ?? null,
  };
}
