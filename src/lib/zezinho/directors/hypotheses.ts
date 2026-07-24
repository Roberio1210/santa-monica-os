import type { Diagnosis, Finding, Hypothesis as ReasoningHypothesis } from "@/lib/zezinho/reasoning/types";
import type { ConfidenceLevel } from "@/lib/zezinho/reasoning/types";
import type { Hypothesis } from "@/lib/zezinho/directors/types";

/**
 * Hipóteses (Sprint 5.0, Z2 — decisão do usuário). Nunca um cálculo novo: converte o `Diagnosis`
 * que `reasoning/diagnose.ts` já produzia desde a Sprint 3.0 (`mainHypothesis` +
 * `alternativeHypotheses`) numa forma mais rica — descrição, evidências, base legível, confiança
 * (qualitativa + uma banda numérica ilustrativa) e limitações explícitas. Sem evidência
 * suficiente (`diagnosis.mainHypothesis === null`), devolve lista vazia — honesto, nunca inventa
 * uma hipótese para preencher espaço.
 */

/**
 * Banda numérica só ilustrativa, convertida de um nível qualitativo — nunca uma probabilidade
 * estatística real. Existe para atender ao formato pedido ("confiança: 82%"), mas o nível
 * qualitativo (`confidenceLevel`) continua sendo a fonte de verdade para qualquer decisão
 * (`computePriority`, seção "Limitações": nunca apresentar confiança com precisão que os dados
 * não sustentam).
 */
export const CONFIDENCE_SCORE_BAND: Record<ConfidenceLevel, number> = { alta: 85, media: 60, baixa: 30 };

const BASIS_LABELS: { test: (key: string) => boolean; label: string }[] = [
  { test: (k) => k === "weather_current", label: "clima" },
  { test: (k) => k === "historical_pattern", label: "histórico" },
  { test: (k) => k === "situational_context", label: "contexto situacional" },
  { test: (k) => ["vehicles", "revenue", "avgTicket", "washCount", "washRevenue", "parkingCount", "parkingRevenue", "packageBronze", "packageSilver", "packageGold"].includes(k), label: "operação" },
  { test: (k) => ["cashEntradas", "cashSaidas", "cashResultado", "dreResultado", "accounts_payable", "accounts_receivable"].includes(k), label: "financeiro" },
  { test: (k) => k === "goal_progress", label: "meta" },
  { test: (k) => k.startsWith("crm_"), label: "clientes" },
  { test: (k) => k === "inventory_near_empty", label: "estoque" },
  { test: (k) => k.startsWith("alert_"), label: "alertas" },
];

function basisLabelFor(factKey: string): string {
  return BASIS_LABELS.find((b) => b.test(factKey))?.label ?? factKey;
}

const MIN_FACTS_FOR_CONCLUSIVE = 2;

function toHypothesis(h: ReasoningHypothesis, findingByKey: Map<string, Finding>): Hypothesis {
  const supportingFindings = h.supportingFindingKeys.map((k) => findingByKey.get(k)).filter((f): f is Finding => !!f);
  const evidenceFactKeys = Array.from(new Set(supportingFindings.flatMap((f) => f.factKeys)));
  const basis = Array.from(new Set(evidenceFactKeys.map(basisLabelFor)));

  const limitations: string[] = [];
  if (evidenceFactKeys.length < MIN_FACTS_FOR_CONCLUSIVE) limitations.push("Baseada em poucos fatos — trate como indicativa, não conclusiva.");

  return {
    description: h.statement,
    evidenceFactKeys,
    basis,
    confidenceScore: CONFIDENCE_SCORE_BAND[h.confidence],
    confidenceLevel: h.confidence,
    limitations,
  };
}

export function buildHypotheses(diagnosis: Diagnosis, findings: Finding[]): Hypothesis[] {
  const findingByKey = new Map(findings.map((f) => [f.key, f]));
  const hypotheses: Hypothesis[] = [];
  if (diagnosis.mainHypothesis) hypotheses.push(toHypothesis(diagnosis.mainHypothesis, findingByKey));
  hypotheses.push(...diagnosis.alternativeHypotheses.map((h) => toHypothesis(h, findingByKey)));
  return hypotheses;
}
