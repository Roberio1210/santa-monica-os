import { buildOperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import { computeContextQuality } from "@/lib/zezinho/planner/contextQuality";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import { deriveFindings } from "@/lib/zezinho/reasoning/findings";
import { buildDiagnosis } from "@/lib/zezinho/reasoning/diagnose";
import { deriveGaps } from "@/lib/zezinho/reasoning/gaps";
import { deriveRecommendations } from "@/lib/zezinho/reasoning/recommend";
import { deriveRisksAndOpportunities } from "@/lib/zezinho/reasoning/risksAndOpportunities";
import { resolvePeriod } from "@/lib/utils/timezone";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import { EMPTY_REASONING_SESSION, type ReasoningSession } from "@/lib/zezinho/memory/types";
import type { Director, DirectorReport, PriorityLevel } from "@/lib/zezinho/directors/types";

/**
 * Executor genérico de um Diretor (Sprint 5.0, Z1) — reaproveita 100% do motor de raciocínio já
 * existente (Sprint 3.0/4.0), só escopado às capacidades do diretor. Nenhum cálculo novo:
 * `runDirector` é, na prática, uma versão estreita de `planner/managerialPlan.ts:buildManagerialPlan`,
 * trocando "capacidades pedidas pela intenção da mensagem" por "capacidades que pertencem a este
 * diretor".
 */

const EMPTY_ENTITIES: ExtractedEntities = { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null };

/**
 * Um Diretor pode rodar dentro de uma conversa real (período já resolvido pela mensagem/memória)
 * ou sozinho (ex.: Executive Briefing, sem nenhuma pergunta) — neste segundo caso, sem período
 * nenhum disponível, ferramentas como `cash_ledger_totals`/`jumppark_period_summary` seriam
 * puladas por não terem período (`requiresPeriod`). Para nunca deixar um diretor "mudo" fora de
 * uma conversa, o período padrão é sempre "hoje" quando nem a mensagem nem a memória trazem um.
 */
function resolveEntitiesFor(director: Director, entities: ExtractedEntities, memory: ReasoningSession): ExtractedEntities {
  const merged: ExtractedEntities = { ...EMPTY_ENTITIES, ...entities, topic: entities.topic ?? director.defaultTopic };
  const hasPeriodContext = merged.comparison !== null || merged.singlePeriod !== null || memory.activePeriodA !== null;
  if (hasPeriodContext) return merged;
  return { ...merged, singlePeriod: resolvePeriod("today") };
}

/** Prioridade preliminar (Z1) — versão simples, formalizada em `computePriority` no checkpoint Z2 (seção 5 do documento de arquitetura). */
function estimatePriority(risksCount: number, opportunitiesCount: number, hasHighPriorityRecommendation: boolean): PriorityLevel {
  if (risksCount > 0) return "alta";
  if (opportunitiesCount > 0 || hasHighPriorityRecommendation) return "media";
  return "baixa";
}

export async function runDirector(director: Director, entities: ExtractedEntities = EMPTY_ENTITIES, memory: ReasoningSession = EMPTY_REASONING_SESSION): Promise<DirectorReport> {
  const generatedAt = new Date().toISOString();

  if (director.ownedCapabilities.length === 0) {
    // Diretores sem nenhuma capacidade própria (RH hoje; Estratégico/Inteligência por desenho —
    // eles consolidam/cruzam, nunca observam sozinhos, ver estrategico.ts/inteligencia.ts) nunca
    // fingem ter dado: o relatório é honesto sobre a ausência de fonte, nunca fica vazio sem
    // explicação.
    const limitations = director.dataAvailability === "indisponivel" ? [`Nenhuma fonte de dado real configurada para ${director.label} ainda — recomendações aqui ficam limitadas até uma integração real existir.`] : [];
    const report: Omit<DirectorReport, "shouldParticipateInBriefing"> = {
      director: director.id,
      generatedAt,
      dataAvailability: director.dataAvailability,
      facts: [],
      risks: [],
      opportunities: [],
      recommendations: [],
      priority: "baixa",
      confidence: { overallLevel: "low", availableSources: [], missingSources: [], staleSources: [], failedSources: [], sampleQuality: null, gaps: [], confidenceDrivers: [], confidenceReducers: limitations },
      limitations,
      memoryNote: null,
    };
    return { ...report, shouldParticipateInBriefing: director.participationCriteria(report as DirectorReport) };
  }

  const resolvedEntities = resolveEntitiesFor(director, entities, memory);
  const context = await buildOperationalContext(director.ownedCapabilities, resolvedEntities, memory);
  const confidence = computeContextQuality(context);

  const facts = extractFacts(context.toolResults);
  const findings = deriveFindings(facts);
  const diagnosis = buildDiagnosis(findings);
  const gaps = deriveGaps(context.toolResults, director.defaultObjective);
  const recommendations = deriveRecommendations(facts, findings, director.defaultObjective, resolvedEntities, "", diagnosis.mainHypothesis?.statement ?? null);
  const { risks, opportunities } = deriveRisksAndOpportunities(context, facts);

  const limitations = Array.from(new Set([...gaps.map((g) => g.description), ...context.toolResults.flatMap((r) => r.limitations)]));
  const priority = estimatePriority(risks.length, opportunities.length, recommendations.some((r) => r.priority === "alta"));

  const report: Omit<DirectorReport, "shouldParticipateInBriefing"> = {
    director: director.id,
    generatedAt,
    dataAvailability: director.dataAvailability,
    facts,
    risks,
    opportunities,
    recommendations,
    priority,
    confidence,
    limitations,
    memoryNote: null,
  };

  return { ...report, shouldParticipateInBriefing: director.participationCriteria(report as DirectorReport) };
}
