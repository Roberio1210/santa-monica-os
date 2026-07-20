import { normalize } from "@/lib/zezinho/date-parser";
import { buildLinks as buildComparisonLinks, buildSources as buildComparisonSources } from "@/lib/zezinho/response-builder";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import { deriveFindings } from "@/lib/zezinho/reasoning/findings";
import { buildDiagnosis, overallConfidence } from "@/lib/zezinho/reasoning/diagnose";
import { deriveGaps } from "@/lib/zezinho/reasoning/gaps";
import { deriveRecommendations } from "@/lib/zezinho/reasoning/recommend";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { ZezinhoLink } from "@/lib/zezinho/types";
import type { ReasoningInput, ReasoningResult } from "@/lib/zezinho/reasoning/types";

/**
 * Orquestrador da Etapa 4 (raciocínio) — combina fatos, achados, diagnóstico, confiança, lacunas
 * e recomendações num único `ReasoningResult`, que a Etapa 5 (narrador) transforma em prosa. Puro:
 * recebe os resultados das ferramentas já buscados (Z2), nunca faz I/O.
 */

const OBJECTIVE_LINKS: Partial<Record<BusinessObjective, ZezinhoLink[]>> = {
  improve_service_mix: [{ label: "Ver Lavação por categoria", href: "/lavacao" }],
  reduce_costs: [{ label: "Ver Estoque", href: "/estoque" }],
  improve_cash_flow: [{ label: "Ver Fluxo de Caixa", href: "/financeiro/fluxo-de-caixa" }],
  business_health: [{ label: "Ver Central de Operações", href: "/dashboard" }],
};

function buildLinksAndSources(input: ReasoningInput): { links: ZezinhoLink[]; sources: string[] } {
  const fullComparison = input.toolResults.find((r) => r.id === "full_period_comparison");
  if (fullComparison && fullComparison.id === "full_period_comparison") {
    return { links: buildComparisonLinks(fullComparison.report), sources: buildComparisonSources(fullComparison.report) };
  }

  const sources = input.toolResults.map((r) => (r.error ? `⚠ ${r.error}` : r.source)).filter((s, i, arr) => arr.indexOf(s) === i);
  const links = (input.objective && OBJECTIVE_LINKS[input.objective]) ?? [];
  return { links, sources };
}

export function reason(input: ReasoningInput, rawText: string): ReasoningResult {
  const facts = extractFacts(input.toolResults);
  const findings = deriveFindings(facts);
  const diagnosis = buildDiagnosis(findings);
  const gaps = deriveGaps(input.toolResults, input.objective);
  const confidence = overallConfidence(diagnosis, gaps.some((g) => g.description.includes("proxy")));
  const recommendations = deriveRecommendations(facts, findings, input.objective, input.entities, normalize(rawText), diagnosis.mainHypothesis?.statement ?? null);
  const { links, sources } = buildLinksAndSources(input);

  return {
    intent: input.intent,
    objective: input.objective,
    facts,
    findings,
    diagnosis,
    confidence,
    gaps,
    recommendations,
    links,
    sources,
    toolTrace: input.toolTrace,
  };
}
