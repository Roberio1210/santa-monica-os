import type { ToolId } from "@/lib/zezinho/tools/types";

/**
 * Motor de raciocínio (Etapa 4 — ver docs/zezinho-3.0-architecture.md, seção 7). Recebe fatos já
 * calculados pelas ferramentas (Z2) e produz achados, diagnóstico, confiança, lacunas e
 * recomendações — nunca um número novo, nunca IA generativa: tudo aqui é regra determinística
 * sobre o que as ferramentas já trouxeram. `ReasoningInput`/`ReasoningResult` (o envelope do
 * antigo orquestrador de intenção única, `reasoning/reason.ts`) foram removidos na Sprint 4.0
 * (Z4) — os tipos abaixo continuam vivos porque `reasoning/facts.ts`, `findings.ts`,
 * `diagnose.ts`, `gaps.ts` e `recommend.ts` são reaproveitados diretamente por
 * `planner/managerialPlan.ts` e, a partir da Sprint 5.0, por `directors/runDirector.ts`.
 */

export type FactDirection = "aumento" | "queda" | "estavel" | "indisponivel";
export type ConfidenceLevel = "alta" | "media" | "baixa";

export interface Fact {
  key: string;
  label: string;
  /** Frase pronta, já com a ordem correta (anterior -> atual) quando aplicável. */
  statement: string;
  direction: FactDirection;
  source: string;
  /** `true` quando o fato é uma estimativa indireta (proxy), nunca uma medição direta. */
  isProxy: boolean;
}

export interface Finding {
  key: string;
  /** Relaciona 2+ fatos sem prescrever ação — ex.: "o aumento veio de volume, não de ticket". */
  statement: string;
  factKeys: string[];
  confidence: ConfidenceLevel;
}

export interface Hypothesis {
  statement: string;
  supportingFindingKeys: string[];
  confidence: ConfidenceLevel;
}

export interface Diagnosis {
  mainHypothesis: Hypothesis | null;
  alternativeHypotheses: Hypothesis[];
}

export interface Gap {
  description: string;
}

export interface Recommendation {
  action: string;
  reason: string;
  evidenceFactKeys: string[];
  priority: "alta" | "media" | "baixa";
  risk: string | null;
  howToVerify: string;
}

export interface ToolTraceEntry {
  id: ToolId;
  durationMs: number;
  error: string | null;
}

/**
 * Afirmação evidenciada (risco ou oportunidade) — nasce em `reasoning/risksAndOpportunities.ts`,
 * usada por `planner/managerialPlan.ts` e `directors/runDirector.ts`. Nunca existe sem
 * `evidenceFactKeys` apontando para `Fact`s reais.
 */
export interface EvidencedClaim {
  statement: string;
  evidenceFactKeys: string[];
}
