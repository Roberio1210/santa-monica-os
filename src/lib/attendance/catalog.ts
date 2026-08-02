import type { ExteriorArea } from "@/lib/attendance/types";

/**
 * Catálogos fechados de problema — só Pintura e Rodas têm lista curada pelo negócio; as demais
 * áreas (pneus, plásticos, vidros, faróis, motor, chassi, interior) só recebem condição nesta
 * sprint, sem lista de problema própria (nunca inventada aqui).
 */
export const PAINT_PROBLEMS = [
  "contaminacao_ferrica",
  "chuva_acida",
  "piche",
  "riscos",
  "oxidacao",
  "swirls",
  "hologramas",
  "fezes",
  "resina",
  "outro",
] as const;
export type PaintProblem = (typeof PAINT_PROBLEMS)[number];
export const PAINT_PROBLEM_LABELS: Record<PaintProblem, string> = {
  contaminacao_ferrica: "Contaminação férrica",
  chuva_acida: "Chuva ácida",
  piche: "Piche",
  riscos: "Riscos",
  oxidacao: "Oxidação",
  swirls: "Swirls",
  hologramas: "Hologramas",
  fezes: "Fezes",
  resina: "Resina",
  outro: "Outro",
};

export const WHEEL_PROBLEMS = ["poeira_de_freio", "graxa", "oxidacao", "arranhoes", "outro"] as const;
export type WheelProblem = (typeof WHEEL_PROBLEMS)[number];
export const WHEEL_PROBLEM_LABELS: Record<WheelProblem, string> = {
  poeira_de_freio: "Poeira de freio",
  graxa: "Graxa",
  oxidacao: "Oxidação",
  arranhoes: "Arranhões",
  outro: "Outro",
};

/** Áreas com catálogo de problema curado — as demais só têm condição nesta sprint. */
export const AREA_PROBLEM_CATALOG: Partial<Record<ExteriorArea, readonly string[]>> = {
  pintura: PAINT_PROBLEMS,
  rodas: WHEEL_PROBLEMS,
};

export const AREA_PROBLEM_LABELS: Record<string, string> = {
  ...PAINT_PROBLEM_LABELS,
  ...WHEEL_PROBLEM_LABELS,
};

/**
 * Categorias de recomendação — mistura deliberada de causa (chuva ácida) e serviço (vitrificação),
 * exatamente como especificado pelo negócio. Texto livre no banco (nunca enum) para poder crescer
 * sem migration.
 */
export const RECOMMENDATION_CATEGORIES = [
  "chuva_acida",
  "motor",
  "farois",
  "plasticos",
  "polimento",
  "higienizacao",
  "vitrificacao",
  "outro",
] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];
export const RECOMMENDATION_CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  chuva_acida: "Chuva Ácida",
  motor: "Motor",
  farois: "Faróis",
  plasticos: "Plásticos",
  polimento: "Polimento",
  higienizacao: "Higienização",
  vitrificacao: "Vitrificação",
  outro: "Outro",
};

export function recommendationCategoryLabel(category: string): string {
  return RECOMMENDATION_CATEGORY_LABELS[category as RecommendationCategory] ?? category;
}
