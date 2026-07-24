import type { DirectorReport, ImpactAssessment } from "@/lib/zezinho/directors/types";
import type { Fact } from "@/lib/zezinho/reasoning/types";

/**
 * Fixtures compartilhadas só para testes (`*.test.ts`) dos módulos de `directors/` — nunca
 * importado por código de produção. Centraliza a forma de `DirectorReport` para não duplicar o
 * mesmo objeto-base em cada arquivo de teste toda vez que o tipo ganhar um campo novo (Sprint
 * 5.0, Z2 — `diagnosis`/`hypotheses`/`actionPlans`/`impact`).
 */

const NEUTRAL_IMPACT: ImpactAssessment = { financialImpact: "indeterminado", operationalImpact: "indeterminado", urgency: "media", dataConfidence: "media", directorsInvolved: 1 };

export function testReport(overrides: Partial<DirectorReport> = {}): DirectorReport {
  return {
    director: "financeiro",
    generatedAt: "2026-07-24T12:00:00.000Z",
    dataAvailability: "real",
    facts: [],
    diagnosis: null,
    hypotheses: [],
    confidence: { overallLevel: "high", availableSources: [], missingSources: [], staleSources: [], failedSources: [], sampleQuality: null, gaps: [], confidenceDrivers: [], confidenceReducers: [] },
    risks: [],
    opportunities: [],
    recommendations: [],
    actionPlans: [],
    priority: "baixa",
    impact: NEUTRAL_IMPACT,
    limitations: [],
    memoryNote: null,
    shouldParticipateInBriefing: false,
    ...overrides,
  };
}

export function testFact(overrides: Partial<Fact> = {}): Fact {
  return { key: "x", label: "X", statement: "x.", direction: "indisponivel", source: "teste", isProxy: false, ...overrides };
}
