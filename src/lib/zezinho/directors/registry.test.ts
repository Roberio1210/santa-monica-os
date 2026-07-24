import { describe, expect, it } from "vitest";
import { DIRECTOR_REGISTRY, OBSERVER_DIRECTOR_IDS } from "@/lib/zezinho/directors/registry";
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

describe("DIRECTOR_REGISTRY — todos os 8 Diretores declarados (Sprint 5.0, Z1)", () => {
  it("declara exatamente os 8 diretores pedidos", () => {
    expect(Object.keys(DIRECTOR_REGISTRY).sort()).toEqual(["comercial", "estoque", "estrategico", "financeiro", "inteligencia", "marketing", "operacoes", "rh"].sort());
  });

  it("cada diretor tem um label e um id consistente", () => {
    for (const [id, director] of Object.entries(DIRECTOR_REGISTRY)) {
      expect(director.id).toBe(id);
      expect(director.label.length).toBeGreaterThan(0);
    }
  });

  it("RH e Marketing são declarados 'indisponivel' — nunca fingem ter fonte real", () => {
    expect(DIRECTOR_REGISTRY.rh.dataAvailability).toBe("indisponivel");
    expect(DIRECTOR_REGISTRY.marketing.dataAvailability).toBe("indisponivel");
  });

  it("RH não possui nenhuma capacidade própria (nenhum módulo de RH real existe)", () => {
    expect(DIRECTOR_REGISTRY.rh.ownedCapabilities).toEqual([]);
  });
});

describe("participationCriteria — critérios objetivos de participação no Executive Briefing", () => {
  it("RH e Marketing nunca participam automaticamente, mesmo com prioridade alta simulada", () => {
    expect(DIRECTOR_REGISTRY.rh.participationCriteria(report({ director: "rh", priority: "alta" }))).toBe(false);
    expect(DIRECTOR_REGISTRY.marketing.participationCriteria(report({ director: "marketing", priority: "alta" }))).toBe(false);
  });

  it("diretores reais participam quando a prioridade não é baixa", () => {
    expect(DIRECTOR_REGISTRY.financeiro.participationCriteria(report({ priority: "alta" }))).toBe(true);
    expect(DIRECTOR_REGISTRY.financeiro.participationCriteria(report({ priority: "media" }))).toBe(true);
    expect(DIRECTOR_REGISTRY.financeiro.participationCriteria(report({ priority: "baixa" }))).toBe(false);
  });

  it("Estratégico sempre participa (é o consolidador, não um observador)", () => {
    expect(DIRECTOR_REGISTRY.estrategico.participationCriteria(report({ director: "estrategico", priority: "baixa" }))).toBe(true);
  });

  it("OBSERVER_DIRECTOR_IDS exclui Estratégico e Inteligência", () => {
    expect(OBSERVER_DIRECTOR_IDS).not.toContain("estrategico");
    expect(OBSERVER_DIRECTOR_IDS).not.toContain("inteligencia");
    expect(OBSERVER_DIRECTOR_IDS.length).toBe(6);
  });
});
