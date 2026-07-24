import { describe, expect, it } from "vitest";
import { consolidate } from "@/lib/zezinho/directors/estrategico";
import type { DirectorReport } from "@/lib/zezinho/directors/types";

function report(overrides: Partial<DirectorReport>): DirectorReport {
  return {
    director: "financeiro",
    generatedAt: "2026-07-24T12:00:00.000Z",
    dataAvailability: "real",
    facts: [],
    risks: [],
    opportunities: [],
    recommendations: [],
    priority: "baixa",
    confidence: { overallLevel: "high", availableSources: [], missingSources: [], staleSources: [], failedSources: [], sampleQuality: null, gaps: [], confidenceDrivers: [], confidenceReducers: [] },
    limitations: [],
    memoryNote: null,
    shouldParticipateInBriefing: false,
    ...overrides,
  };
}

describe("consolidate — Diretor Estratégico (Sprint 5.0, Z1: consolidação simples)", () => {
  it("nunca perde informação — todos os relatórios de origem continuam íntegros", () => {
    const r1 = report({ director: "financeiro", risks: [{ statement: "risco financeiro", evidenceFactKeys: ["x"] }] });
    const r2 = report({ director: "estoque", opportunities: [{ statement: "oportunidade de estoque", evidenceFactKeys: ["y"] }] });
    const consolidated = consolidate([r1, r2]);
    expect(consolidated.reports).toEqual([r1, r2]);
    expect(consolidated.risks).toHaveLength(1);
    expect(consolidated.opportunities).toHaveLength(1);
  });

  it("prioridade geral é a maior prioridade entre todos os diretores", () => {
    const consolidated = consolidate([report({ priority: "baixa" }), report({ director: "estoque", priority: "alta" })]);
    expect(consolidated.overallPriority).toBe("alta");
  });

  it("sem nenhum risco de nenhum diretor, prioridade geral é baixa", () => {
    const consolidated = consolidate([report({ priority: "baixa" }), report({ director: "estoque", priority: "baixa" })]);
    expect(consolidated.overallPriority).toBe("baixa");
  });

  it("participatingDirectors reflete só quem passou no próprio participationCriteria", () => {
    const consolidated = consolidate([report({ director: "financeiro", shouldParticipateInBriefing: true }), report({ director: "rh", shouldParticipateInBriefing: false })]);
    expect(consolidated.participatingDirectors).toEqual(["financeiro"]);
  });

  it("limitations nunca duplica a mesma frase de dois diretores", () => {
    const consolidated = consolidate([report({ director: "financeiro", limitations: ["JumpPark não configurado."] }), report({ director: "operacoes", limitations: ["JumpPark não configurado."] })]);
    expect(consolidated.limitations).toEqual(["JumpPark não configurado."]);
  });

  it("correlações do Diretor de Inteligência são preservadas na saída consolidada", () => {
    const consolidated = consolidate([report({})], [{ statement: "correlação real", confidence: "media", evidenceFactKeys: ["a", "b"], directors: ["financeiro", "operacoes"] }]);
    expect(consolidated.correlations).toHaveLength(1);
  });
});
