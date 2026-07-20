import type { ConfidenceLevel, Diagnosis, Finding } from "@/lib/zezinho/reasoning/types";

/** Diagnóstico (Etapa 4, terceira camada) — escolhe a hipótese principal entre os achados e guarda as demais como alternativas. */

const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = { alta: 3, media: 2, baixa: 1 };

export function buildDiagnosis(findings: Finding[]): Diagnosis {
  if (findings.length === 0) return { mainHypothesis: null, alternativeHypotheses: [] };

  const sorted = [...findings].sort((a, b) => CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence]);
  const [main, ...rest] = sorted;

  return {
    mainHypothesis: { statement: main.statement, supportingFindingKeys: [main.key], confidence: main.confidence },
    alternativeHypotheses: rest.slice(0, 2).map((finding) => ({ statement: finding.statement, supportingFindingKeys: [finding.key], confidence: finding.confidence })),
  };
}

/** Confiança geral da resposta — a pior confiança entre a hipótese principal e as lacunas de proxy determina o teto. */
export function overallConfidence(diagnosis: Diagnosis, hasProxyGap: boolean): ConfidenceLevel {
  if (!diagnosis.mainHypothesis) return "baixa";
  if (hasProxyGap) return diagnosis.mainHypothesis.confidence === "alta" ? "media" : "baixa";
  return diagnosis.mainHypothesis.confidence;
}
