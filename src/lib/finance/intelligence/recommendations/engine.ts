import { findTrend } from "@/lib/finance/intelligence/trends/engine";
import type { Diagnostic, DiagnosticSeverity, FinancialMetricSet, Recommendation, RecommendationCategory, RecommendationPriority, TrendResult } from "@/lib/finance/intelligence/types";

/**
 * Motor de recomendações (Sprint 8, seção "RECOMENDAÇÕES") — recebe `metrics` + `trends` +
 * `diagnostics` já calculados e produz ações executivas. Cada diagnóstico gera no máximo uma
 * recomendação direta (rastreável); quando não há nenhum alerta, gera recomendações de linha de
 * base honestas ("está tudo bem", nunca inventadas).
 */

const DIAGNOSTIC_CATEGORY: Record<string, RecommendationCategory> = {
  ticket_medio_caiu: "pricing",
  receita_cresceu: "growth",
  taxas_aumentaram: "pricing",
  recebiveis_atrasados_cresceram: "risk",
  liquidacao_lenta: "cash_flow",
  excesso_antecipacao: "cash_flow",
  concentracao_elevada: "risk",
  volume_acima_da_media: "operations",
  volume_abaixo_da_media: "operations",
};

function priorityFromSeverity(severity: DiagnosticSeverity): RecommendationPriority {
  if (severity === "critical") return "high";
  if (severity === "warning") return "medium";
  return "low";
}

function impactFromSeverity(severity: DiagnosticSeverity): RecommendationPriority {
  return priorityFromSeverity(severity);
}

/** Converte um diagnóstico em recomendação — reaproveita o texto já escrito em `diagnostic.recommendation`, nunca duplica a lógica de decisão. */
export function recommendationFromDiagnostic(diagnostic: Diagnostic): Recommendation {
  return {
    priority: priorityFromSeverity(diagnostic.severity),
    impact: impactFromSeverity(diagnostic.severity),
    confidence: diagnostic.confidence,
    category: DIAGNOSTIC_CATEGORY[diagnostic.id] ?? "operations",
    text: diagnostic.recommendation,
  };
}

/** Recomendações de linha de base — só geradas quando não há diagnóstico de alerta (`warning`/`critical`) cobrindo o mesmo tema, nunca contradizem um diagnóstico real. */
export function baselineRecommendations(metrics: FinancialMetricSet, trends: TrendResult[], diagnostics: Diagnostic[]): Recommendation[] {
  const alertIds = new Set(diagnostics.filter((d) => d.severity !== "info").map((d) => d.id));
  const recommendations: Recommendation[] = [];

  const revenueTrend = findTrend(trends, "netRevenue");
  if (revenueTrend && revenueTrend.direction === "estavel") {
    recommendations.push({ priority: "low", impact: "low", confidence: "medium", category: "growth", text: "Receita está estável — nenhuma ação corretiva necessária no momento." });
  }

  if (!alertIds.has("recebiveis_atrasados_cresceram") && !alertIds.has("liquidacao_lenta") && metrics.overdueReceivablesAmount < metrics.settledReceivablesAmount * 0.05) {
    recommendations.push({ priority: "low", impact: "low", confidence: "medium", category: "cash_flow", text: "Fluxo de caixa confortável — recebíveis vencidos representam uma fração pequena do total liquidado." });
  }

  if (!alertIds.has("excesso_antecipacao") && metrics.advancedPercentage > 0 && metrics.advancedPercentage < 10) {
    recommendations.push({ priority: "low", impact: "low", confidence: "medium", category: "cash_flow", text: "Nível de antecipação de recebíveis está saudável — sem necessidade de revisão." });
  }

  return recommendations;
}

/**
 * Gera as recomendações finais do período — um diagnóstico sempre vira recomendação; quando não
 * há nenhum diagnóstico de alerta, complementa com recomendações de linha de base. Ordenadas por
 * prioridade (alta primeiro).
 */
export function generateRecommendations(metrics: FinancialMetricSet, trends: TrendResult[], diagnostics: Diagnostic[]): Recommendation[] {
  const fromDiagnostics = diagnostics.map(recommendationFromDiagnostic);
  const baseline = baselineRecommendations(metrics, trends, diagnostics);
  const priorityRank: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };
  return [...fromDiagnostics, ...baseline].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}
