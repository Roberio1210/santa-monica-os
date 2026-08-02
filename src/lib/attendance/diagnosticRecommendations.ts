import { ENGINE_CONDITION_LABELS, ISSUE_LEVELS, type TechnicalDiagnosticInput } from "@/lib/attendance/types";

/**
 * Motor de recomendação do Diagnóstico Técnico Inteligente (Missão 19) — puro, sem I/O. Cada
 * regra só existe porque há um problema real diagnosticado E um serviço real correspondente no
 * catálogo (`services`, ver `src/db/seed/recipe-engine-services.ts`). Nunca recomenda um serviço
 * aleatório: sem evidência, sem sugestão.
 *
 * As 4 regras citadas explicitamente pelo negócio (chuva ácida → remoção; vidro contaminado →
 * cristalização; couro ressecado → hidratação; motor muito sujo → lavagem técnica) estão marcadas
 * abaixo. As demais são generalizações diretas do mesmo padrão evidência→serviço real, documentadas
 * como decisão desta sprint.
 */
export interface DiagnosticSuggestion {
  /** Também usado como `category` ao registrar a recomendação (`technical_recommendations`). */
  id: string;
  reason: string;
}

const DIRTY_ENGINE_CONDITIONS = ["sujo", "muito_sujo"] as const;

export function deriveDiagnosticSuggestions(diagnostic: TechnicalDiagnosticInput): DiagnosticSuggestion[] {
  const suggestions: DiagnosticSuggestion[] = [];

  // Regra explícita do negócio: "Se existir chuva ácida: permitir sugerir remoção de chuva ácida."
  if (diagnostic.pintura.chuvaAcida !== "nenhuma") {
    suggestions.push({ id: "chuva_acida", reason: `Chuva ácida identificada na pintura (${diagnostic.pintura.chuvaAcida}).` });
  }

  // Generalização: riscos/hologramas são corrigidos pelo mesmo serviço real do catálogo (Polimento Técnico).
  if (diagnostic.pintura.riscos !== "nenhuma" || diagnostic.pintura.hologramas !== "nenhuma") {
    suggestions.push({ id: "polimento", reason: "Riscos ou hologramas identificados na pintura." });
  }

  // Regra explícita do negócio: "Se existir vidro contaminado: permitir sugerir cristalização."
  if (diagnostic.vidros.contaminacao) {
    suggestions.push({ id: "cristalizacao_vidros", reason: "Contaminação identificada nos vidros." });
  }

  // Regra explícita do negócio: "Se existir couro ressecado: permitir sugerir hidratação."
  if (diagnostic.interior.couro) {
    suggestions.push({ id: "hidratacao_couro", reason: "Couro ressecado identificado no interior." });
  }

  // Regra explícita do negócio: "Se existir motor muito sujo: permitir sugerir lavagem técnica de motor."
  // Generalização: "sujo" recebe a mesma sugestão — mesmo problema, mesmo serviço real do catálogo.
  if (diagnostic.motor.condition && DIRTY_ENGINE_CONDITIONS.includes(diagnostic.motor.condition as (typeof DIRTY_ENGINE_CONDITIONS)[number])) {
    suggestions.push({ id: "motor", reason: `Motor avaliado como "${ENGINE_CONDITION_LABELS[diagnostic.motor.condition]}".` });
  }

  // Generalização: contaminação geral do interior (tecidos/tapetes/odor/pelos/areia) é coberta por
  // Higienização Interna, já no catálogo — plásticos/teto/porta-malas/vidros internos ficam fora
  // porque não há serviço específico claro no catálogo para eles nesta sprint.
  if (diagnostic.interior.tecidos || diagnostic.interior.tapetes || diagnostic.interior.odor || diagnostic.interior.pelosAnimais || diagnostic.interior.areia) {
    suggestions.push({ id: "higienizacao", reason: "Contaminação identificada no interior (tecidos, tapetes, odor, pelos de animais ou areia)." });
  }

  return suggestions;
}

/**
 * Nº de sinais significativos além do padrão de uma Lavagem de Manutenção (Bronze) — usado só para
 * destacar visualmente que Silver/Gold/Premium Detail podem servir melhor. Nunca decide sozinho:
 * "a decisão final será sempre humana" (especificação da Missão 19).
 */
const MEDIUM_OR_HIGH_LEVELS: string[] = ISSUE_LEVELS.filter((level) => level !== "nenhuma" && level !== "leve");

export function countSignificantIssues(diagnostic: TechnicalDiagnosticInput): number {
  let count = 0;
  if (diagnostic.pintura.chuvaAcida !== "nenhuma") count += 1;
  if (MEDIUM_OR_HIGH_LEVELS.includes(diagnostic.pintura.riscos)) count += 1;
  if (MEDIUM_OR_HIGH_LEVELS.includes(diagnostic.pintura.hologramas)) count += 1;
  if (diagnostic.pintura.manchas !== "nenhuma") count += 1;
  if (diagnostic.rodas.sujeiraPesada) count += 1;
  if (diagnostic.rodas.contaminacao) count += 1;
  if (diagnostic.rodas.oxidacao) count += 1;
  if (diagnostic.rodas.freioImpregnado) count += 1;
  if (diagnostic.vidros.contaminacao) count += 1;
  if (diagnostic.vidros.marcasDagua) count += 1;
  if (diagnostic.motor.condition && DIRTY_ENGINE_CONDITIONS.includes(diagnostic.motor.condition as (typeof DIRTY_ENGINE_CONDITIONS)[number])) count += 1;
  count += Object.values(diagnostic.interior).filter(Boolean).length;
  return count;
}

/** Limiar de decisão própria desta sprint (nunca especificado pelo negócio) — documentado aqui. */
export const SIGNIFICANT_ISSUE_THRESHOLD = 3;

export function shouldSuggestPackageUpgrade(diagnostic: TechnicalDiagnosticInput): boolean {
  return countSignificantIssues(diagnostic) >= SIGNIFICANT_ISSUE_THRESHOLD;
}
