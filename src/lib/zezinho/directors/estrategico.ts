import type { Correlation, DirectorReport, ConsolidatedReport, PriorityLevel } from "@/lib/zezinho/directors/types";

/**
 * Diretor Estratégico — consolidação (Sprint 5.0, Z1). Nunca observa uma fonte própria (além de
 * `central_alerts`, já transversal por natureza — ver `directors/registry.ts`); recebe os
 * `DirectorReport`s dos demais Diretores já prontos e aplica regras puras.
 *
 * No Z1 a consolidação é deliberadamente simples — concatenar, nunca perder informação, e
 * calcular a prioridade geral. A deduplicação semântica entre Diretores (ex.: reconhecer que
 * "ticket médio baixo" do Financeiro e "poucos adicionais vendidos" do Comercial são a mesma
 * causa raiz) é trabalho do checkpoint Z2, como já estava no roadmap aprovado — fazer isso bem
 * exige o sistema de prioridade formal (`computePriority`) que ainda não existe.
 */
export function consolidate(reports: DirectorReport[], correlations: Correlation[] = []): ConsolidatedReport {
  const risks = reports.flatMap((r) => r.risks);
  const opportunities = reports.flatMap((r) => r.opportunities);
  const recommendations = reports.flatMap((r) => r.recommendations);
  const limitations = Array.from(new Set(reports.flatMap((r) => r.limitations)));
  const participatingDirectors = reports.filter((r) => r.shouldParticipateInBriefing).map((r) => r.director);

  const priorities = reports.map((r) => r.priority);
  const overallPriority: PriorityLevel = priorities.includes("alta") ? "alta" : priorities.includes("media") ? "media" : "baixa";

  return {
    generatedAt: new Date().toISOString(),
    reports,
    risks,
    opportunities,
    recommendations,
    correlations,
    overallPriority,
    limitations,
    participatingDirectors,
  };
}
