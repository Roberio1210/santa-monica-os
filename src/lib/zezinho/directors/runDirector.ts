import { buildOperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import { computeContextQuality } from "@/lib/zezinho/planner/contextQuality";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import { deriveFindings } from "@/lib/zezinho/reasoning/findings";
import { buildDiagnosis } from "@/lib/zezinho/reasoning/diagnose";
import { deriveGaps } from "@/lib/zezinho/reasoning/gaps";
import { deriveRecommendations } from "@/lib/zezinho/reasoning/recommend";
import { deriveRisksAndOpportunities } from "@/lib/zezinho/reasoning/risksAndOpportunities";
import { resolvePeriod } from "@/lib/utils/timezone";
import { buildHypotheses } from "@/lib/zezinho/directors/hypotheses";
import { buildActionPlans } from "@/lib/zezinho/directors/actionPlan";
import { computeImpact, computePriority } from "@/lib/zezinho/directors/priority";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import { EMPTY_REASONING_SESSION, type ReasoningSession } from "@/lib/zezinho/memory/types";
import type { Director, DirectorReport } from "@/lib/zezinho/directors/types";

/**
 * Executor genérico de um Diretor (Sprint 5.0 — Z1 fundação, Z2 Sistema Executivo de Decisão).
 * Reaproveita 100% do motor de raciocínio já existente (Sprint 3.0/4.0), só escopado às
 * capacidades do diretor. A partir do Z2, todo relatório segue as 8 seções obrigatórias
 * (decisão do usuário): fatos, diagnóstico, hipóteses, confiança, riscos, oportunidades,
 * recomendações, plano de ação — nenhum Diretor devolve só indicadores soltos.
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

export async function runDirector(director: Director, entities: ExtractedEntities = EMPTY_ENTITIES, memory: ReasoningSession = EMPTY_REASONING_SESSION): Promise<DirectorReport> {
  const generatedAt = new Date().toISOString();

  if (director.ownedCapabilities.length === 0) {
    // Diretores sem nenhuma capacidade própria (RH hoje; Estratégico/Inteligência por desenho —
    // eles consolidam/cruzam, nunca observam sozinhos, ver estrategico.ts/inteligencia.ts) nunca
    // fingem ter dado: o relatório é honesto sobre a ausência de fonte, nunca fica vazio sem
    // explicação.
    const limitations = director.dataAvailability === "indisponivel" ? [`Nenhuma fonte de dado real configurada para ${director.label} ainda — recomendações aqui ficam limitadas até uma integração real existir.`] : [];
    const confidence = { overallLevel: "low" as const, availableSources: [], missingSources: [], staleSources: [], failedSources: [], sampleQuality: null, gaps: [], confidenceDrivers: [], confidenceReducers: limitations };
    const report: Omit<DirectorReport, "shouldParticipateInBriefing"> = {
      director: director.id,
      generatedAt,
      dataAvailability: director.dataAvailability,
      facts: [],
      diagnosis: null,
      hypotheses: [],
      confidence,
      risks: [],
      opportunities: [],
      recommendations: [],
      actionPlans: [],
      priority: "baixa",
      impact: computeImpact([], confidence, 1, false),
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
  const diagnosisResult = buildDiagnosis(findings);
  const hypotheses = buildHypotheses(diagnosisResult, findings);
  const gaps = deriveGaps(context.toolResults, director.defaultObjective);
  const recommendations = deriveRecommendations(facts, findings, director.defaultObjective, resolvedEntities, "", diagnosisResult.mainHypothesis?.statement ?? null);
  const { risks, opportunities } = deriveRisksAndOpportunities(context, facts);
  const actionPlans = buildActionPlans(director.id, recommendations);

  const limitations = Array.from(new Set([...gaps.map((g) => g.description), ...context.toolResults.flatMap((r) => r.limitations), ...hypotheses.flatMap((h) => h.limitations)]));

  const allEvidenceFactKeys = Array.from(new Set([...risks.flatMap((r) => r.evidenceFactKeys), ...opportunities.flatMap((o) => o.evidenceFactKeys)]));
  const impact = computeImpact(allEvidenceFactKeys, confidence, 1, risks.length > 0);
  const priority = computePriority(impact);

  const report: Omit<DirectorReport, "shouldParticipateInBriefing"> = {
    director: director.id,
    generatedAt,
    dataAvailability: director.dataAvailability,
    facts,
    diagnosis: diagnosisResult.mainHypothesis?.statement ?? null,
    hypotheses,
    confidence,
    risks,
    opportunities,
    recommendations,
    actionPlans,
    priority,
    impact,
    limitations,
    memoryNote: null,
  };

  return { ...report, shouldParticipateInBriefing: director.participationCriteria(report as DirectorReport) };
}
