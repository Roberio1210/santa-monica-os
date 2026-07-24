import type { OperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import type { SampleQuality } from "@/lib/integrations/jumppark/historical-pattern";

/**
 * Avaliação de qualidade/confiança do contexto (Sprint 4.0, Z3, seção 7) — regras explicáveis em
 * estágios, nunca uma média matemática arbitrária. Cada nível carrega os motivos que levaram a
 * ele (`confidenceDrivers`/`confidenceReducers`), para o narrador (Z4) poder dizer o "porquê", não
 * só o número.
 */
export interface ContextQuality {
  overallLevel: "high" | "medium" | "low";
  availableSources: string[];
  missingSources: string[];
  staleSources: string[];
  failedSources: string[];
  sampleQuality: SampleQuality | null;
  gaps: string[];
  confidenceDrivers: string[];
  confidenceReducers: string[];
}

export function computeContextQuality(context: OperationalContext): ContextQuality {
  const availableSources: string[] = [];
  const missingSources: string[] = [];
  const staleSources: string[] = [];
  const failedSources: string[] = [];
  const gaps: string[] = [];
  const confidenceDrivers: string[] = [];
  const confidenceReducers: string[] = [];
  let sampleQuality: SampleQuality | null = null;

  for (const result of context.toolResults) {
    const label = result.source;
    switch (result.status) {
      case "ok":
        availableSources.push(label);
        confidenceDrivers.push(`${label} disponível`);
        break;
      case "stale_data":
        staleSources.push(label);
        confidenceReducers.push(`${label} com dado desatualizado`);
        break;
      case "not_configured":
      case "no_data":
        missingSources.push(label);
        confidenceReducers.push(`${label} indisponível (${result.status === "not_configured" ? "não configurado" : "sem dado"})`);
        break;
      case "temporary_failure":
      case "insufficient_permission":
        failedSources.push(label);
        confidenceReducers.push(`${label} com falha temporária`);
        break;
    }
    if (result.error) gaps.push(result.error);

    if (result.id === "historical_pattern" && result.pattern) {
      sampleQuality = result.pattern.sampleQuality;
      if (result.pattern.sampleQuality === "insuficiente") confidenceReducers.push("amostra histórica insuficiente");
      else confidenceDrivers.push(`amostra histórica ${result.pattern.sampleQuality}`);
    }
  }

  const total = context.toolResults.length;
  const brokenCount = staleSources.length + missingSources.length + failedSources.length;

  let overallLevel: ContextQuality["overallLevel"] = "high";
  if (total === 0 || availableSources.length === 0) {
    overallLevel = "low";
  } else if (failedSources.length > 0 || sampleQuality === "insuficiente") {
    overallLevel = "medium";
  } else if (total > 0 && brokenCount / total > 0.5) {
    overallLevel = "low";
  } else if (brokenCount > 0) {
    overallLevel = "medium";
  }

  return { overallLevel, availableSources, missingSources, staleSources, failedSources, sampleQuality, gaps, confidenceDrivers, confidenceReducers };
}
