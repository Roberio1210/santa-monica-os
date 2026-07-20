import type { ZezinhoIntent, ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import type { ToolCall, ToolId, ToolResult } from "@/lib/zezinho/tools/types";
import type { ZezinhoLink } from "@/lib/zezinho/types";

/**
 * Motor de raciocínio (Etapa 4 — ver docs/zezinho-3.0-architecture.md, seção 7). Recebe fatos já
 * calculados pelas ferramentas (Z2) e produz achados, diagnóstico, confiança, lacunas e
 * recomendações — nunca um número novo, nunca IA generativa: tudo aqui é regra determinística
 * sobre o que as ferramentas já trouxeram.
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

export interface ReasoningInput {
  intent: ZezinhoIntent;
  objective: BusinessObjective | null;
  entities: ExtractedEntities;
  memory: ReasoningSession;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  toolTrace: ToolTraceEntry[];
}

export interface ReasoningResult {
  intent: ZezinhoIntent;
  objective: BusinessObjective | null;
  facts: Fact[];
  findings: Finding[];
  diagnosis: Diagnosis | null;
  confidence: ConfidenceLevel;
  gaps: Gap[];
  recommendations: Recommendation[];
  links: ZezinhoLink[];
  sources: string[];
  toolTrace: ToolTraceEntry[];
}
