import type { ContextQuality } from "@/lib/zezinho/planner/contextQuality";
import type { ConfidenceLevel } from "@/lib/zezinho/reasoning/types";
import type { ImpactAssessment, PriorityLevel } from "@/lib/zezinho/directors/types";

/**
 * Impacto operacional formal (Sprint 5.0, Z2 — decisão do usuário: "não quero simplesmente
 * ordenar alertas, quero que o Diretor Estratégico calcule impacto operacional"). Critérios
 * pedidos: impacto financeiro, impacto operacional, urgência, confiança dos dados, quantidade de
 * Diretores envolvidos. Cada campo é classificado por regra explicável (mesmo espírito de
 * `computeContextQuality`, Sprint 4.0/Z3) — nunca uma pontuação numérica arbitrária.
 */

/** `Fact.key`s que pertencem ao domínio financeiro — usadas só para classificar impacto, nunca para recalcular o fato em si. */
const FINANCIAL_FACT_KEYS = new Set(["cashEntradas", "cashSaidas", "cashResultado", "dreResultado", "goal_progress", "accounts_payable", "accounts_receivable"]);

/** `Fact.key`s que pertencem ao domínio operacional. */
const OPERATIONAL_FACT_KEYS = new Set(["revenue", "vehicles", "avgTicket", "washCount", "washRevenue", "parkingCount", "parkingRevenue", "historical_pattern", "situational_context", "packageBronze", "packageSilver", "packageGold"]);

function classifyDomainImpact(evidenceFactKeys: string[], domainKeys: Set<string>): ImpactAssessment["financialImpact"] {
  const hits = evidenceFactKeys.filter((k) => domainKeys.has(k)).length;
  if (hits === 0) return "indeterminado";
  if (hits >= 2) return "alto";
  return "medio";
}

/**
 * Monta a avaliação de impacto de um risco/oportunidade/hipótese — `isRisk` distingue urgência
 * (um risco já em curso pede mais urgência que uma oportunidade, que pode esperar uma janela
 * maior sem se perder). `directorsInvolved` vem de quem chama: 1 para um sinal de um único
 * Diretor, o tamanho de `directors[]` para uma `Correlation`/`Hypothesis` cruzada.
 */
export function computeImpact(evidenceFactKeys: string[], confidence: ContextQuality | ConfidenceLevel, directorsInvolved: number, isRisk: boolean): ImpactAssessment {
  const dataConfidence: ConfidenceLevel = typeof confidence === "string" ? confidence : overallLevelToConfidence(confidence.overallLevel);
  return {
    financialImpact: classifyDomainImpact(evidenceFactKeys, FINANCIAL_FACT_KEYS),
    operationalImpact: classifyDomainImpact(evidenceFactKeys, OPERATIONAL_FACT_KEYS),
    urgency: isRisk ? "alta" : "media",
    dataConfidence,
    directorsInvolved,
  };
}

function overallLevelToConfidence(level: ContextQuality["overallLevel"]): ConfidenceLevel {
  if (level === "high") return "alta";
  if (level === "medium") return "media";
  return "baixa";
}

/**
 * Prioridade final — regras em estágios, nunca uma soma ponderada arbitrária. Confiança baixa
 * nunca sozinha vira prioridade alta (Sprint 5.0, Z2, seção "Limitações": "nunca responder com
 * excesso de confiança") — mesmo com vários sinais fortes, o teto fica em "média" quando os
 * dados por trás são pouco confiáveis.
 */
export function computePriority(impact: ImpactAssessment): PriorityLevel {
  const strongSignals = [impact.financialImpact === "alto", impact.operationalImpact === "alto", impact.urgency === "alta", impact.directorsInvolved >= 2].filter(Boolean).length;

  if (impact.dataConfidence === "baixa") return strongSignals >= 3 ? "media" : "baixa";
  if (strongSignals >= 2) return "alta";
  if (strongSignals === 1) return "media";
  return "baixa";
}
