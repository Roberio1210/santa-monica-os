/**
 * Categorias de recomendação — mistura deliberada de causa (chuva ácida) e serviço (vitrificação),
 * exatamente como especificado pelo negócio. Texto livre no banco (nunca enum) para poder crescer
 * sem migration. `cristalizacao_vidros`/`hidratacao_couro` adicionadas na Missão 19 (Diagnóstico
 * Técnico Inteligente) — ver `src/lib/attendance/diagnosticRecommendations.ts`.
 */
export const RECOMMENDATION_CATEGORIES = [
  "chuva_acida",
  "polimento",
  "cristalizacao_vidros",
  "hidratacao_couro",
  "motor",
  "higienizacao",
  "farois",
  "plasticos",
  "vitrificacao",
  "outro",
] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];
export const RECOMMENDATION_CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  chuva_acida: "Chuva Ácida",
  polimento: "Polimento",
  cristalizacao_vidros: "Cristalização de Vidros",
  hidratacao_couro: "Hidratação de Couro",
  motor: "Motor",
  higienizacao: "Higienização",
  farois: "Faróis",
  plasticos: "Plásticos",
  vitrificacao: "Vitrificação",
  outro: "Outro",
};

export function recommendationCategoryLabel(category: string): string {
  return RECOMMENDATION_CATEGORY_LABELS[category as RecommendationCategory] ?? category;
}
