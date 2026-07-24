import { describe, expect, it } from "vitest";
import {
  EMPTY_CONVERSATIONAL_MEMORY,
  allActionPlansSuggested,
  allHypothesesDiscussed,
  allRecommendationsGiven,
  buildTurnFromConsolidatedReport,
  recentQuestions,
  wasHypothesisAlreadyDiscussed,
  wasRecommendationAlreadyGiven,
  withTurn,
} from "@/lib/zezinho/directors/conversationalMemory";
import type { ConsolidatedReport, ConversationTurn, Hypothesis } from "@/lib/zezinho/directors/types";

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return { description: "hipótese", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media", limitations: [], ...overrides };
}

function consolidated(overrides: Partial<ConsolidatedReport> = {}): ConsolidatedReport {
  return {
    generatedAt: "2026-07-24T12:00:00.000Z",
    reports: [],
    risks: [],
    opportunities: [],
    recommendations: [],
    actionPlans: [],
    correlations: [],
    crossDirectorHypotheses: [],
    reviewedHypotheses: [],
    decisions: { whatDeservesAttentionToday: [], whatIWouldDoFirst: null, whatCanWait: [] },
    advice: { statement: "sem dados", basedOnFactKeys: [], confidence: "baixa" },
    overallPriority: "baixa",
    limitations: [],
    participatingDirectors: [],
    ...overrides,
  };
}

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return { askedAt: "2026-07-24T12:00:00.000Z", question: "como está o caixa?", hypotheses: [], decisions: null, recommendations: [], actionPlans: [], ...overrides };
}

describe("conversationalMemory — memória conversacional gerencial (Sprint 5.0, Z3A, decisão do usuário: nunca persistida)", () => {
  it("memória vazia começa sem turnos", () => {
    expect(EMPTY_CONVERSATIONAL_MEMORY.turns).toEqual([]);
  });

  it("withTurn adiciona um turno sem mutar a memória original", () => {
    const t = turn();
    const updated = withTurn(EMPTY_CONVERSATIONAL_MEMORY, t);
    expect(EMPTY_CONVERSATIONAL_MEMORY.turns).toEqual([]);
    expect(updated.turns).toEqual([t]);
  });

  it("respeita o limite de segurança de turnos, mantendo os mais recentes", () => {
    let memory = EMPTY_CONVERSATIONAL_MEMORY;
    for (let i = 0; i < 25; i++) {
      memory = withTurn(memory, turn({ question: `pergunta ${i}` }));
    }
    expect(memory.turns).toHaveLength(20);
    expect(memory.turns[0].question).toBe("pergunta 5");
    expect(memory.turns[memory.turns.length - 1].question).toBe("pergunta 24");
  });

  it("buildTurnFromConsolidatedReport lê o relatório já revisado, nunca recalcula", () => {
    const reviewed = { ...hypothesis({ description: "gargalo de conversão" }), sourceDirector: null, reviews: [] };
    const report = consolidated({
      reviewedHypotheses: [reviewed],
      recommendations: [{ action: "ligar para clientes", reason: "leads disponíveis", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "conferir CRM amanhã" }],
      decisions: { whatDeservesAttentionToday: [], whatIWouldDoFirst: null, whatCanWait: [] },
    });
    const t = buildTurnFromConsolidatedReport("o que fazer hoje?", report, "2026-07-24T09:00:00.000Z");
    expect(t.question).toBe("o que fazer hoje?");
    expect(t.askedAt).toBe("2026-07-24T09:00:00.000Z");
    expect(t.hypotheses).toEqual([hypothesis({ description: "gargalo de conversão" })]);
    expect(t.recommendations).toHaveLength(1);
  });

  it("recentQuestions devolve as perguntas mais recentes primeiro", () => {
    let memory = EMPTY_CONVERSATIONAL_MEMORY;
    memory = withTurn(memory, turn({ question: "primeira" }));
    memory = withTurn(memory, turn({ question: "segunda" }));
    expect(recentQuestions(memory)).toEqual(["segunda", "primeira"]);
  });

  it("wasHypothesisAlreadyDiscussed identifica hipótese repetida pela descrição", () => {
    const memory = withTurn(EMPTY_CONVERSATIONAL_MEMORY, turn({ hypotheses: [hypothesis({ description: "gargalo de conversão" })] }));
    expect(wasHypothesisAlreadyDiscussed(memory, "gargalo de conversão")).toBe(true);
    expect(wasHypothesisAlreadyDiscussed(memory, "outra hipótese")).toBe(false);
  });

  it("wasRecommendationAlreadyGiven identifica recomendação repetida pela ação", () => {
    const memory = withTurn(
      EMPTY_CONVERSATIONAL_MEMORY,
      turn({ recommendations: [{ action: "ligar para clientes", reason: "x", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "y" }] }),
    );
    expect(wasRecommendationAlreadyGiven(memory, "ligar para clientes")).toBe(true);
    expect(wasRecommendationAlreadyGiven(memory, "outra ação")).toBe(false);
  });

  it("allHypothesesDiscussed/allRecommendationsGiven/allActionPlansSuggested deduplicam entre turnos", () => {
    let memory = EMPTY_CONVERSATIONAL_MEMORY;
    const rec = { action: "ligar para clientes", reason: "x", evidenceFactKeys: [], priority: "alta" as const, risk: null, howToVerify: "y" };
    const plan = { id: "p1", status: "identificado" as const, action: "ligar para clientes", reason: "x", priority: "alta" as const, responsible: null, expectedImpact: "y", suggestedDeadline: null, evidenceFactKeys: [] };
    memory = withTurn(memory, turn({ hypotheses: [hypothesis({ description: "h1" })], recommendations: [rec], actionPlans: [plan] }));
    memory = withTurn(memory, turn({ hypotheses: [hypothesis({ description: "h1" }), hypothesis({ description: "h2" })], recommendations: [rec], actionPlans: [plan] }));

    expect(allHypothesesDiscussed(memory).map((h) => h.description)).toEqual(["h1", "h2"]);
    expect(allRecommendationsGiven(memory)).toHaveLength(1);
    expect(allActionPlansSuggested(memory)).toHaveLength(1);
  });
});
