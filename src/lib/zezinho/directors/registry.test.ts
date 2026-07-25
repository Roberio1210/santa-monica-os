import { describe, expect, it } from "vitest";
import { DIRECTOR_REGISTRY, OBSERVER_DIRECTOR_IDS } from "@/lib/zezinho/directors/registry";
import { testReport as report } from "@/lib/zezinho/directors/testFixtures";

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

  it("Financeiro possui a capacidade stone_reconciliation_summary (Sprint 7.0, Z2)", () => {
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).toContain("stone_reconciliation_summary");
  });

  it("Financeiro possui stone_financial_schedule e stone_jumppark_reconciliation (Sprint 7.0, Z3)", () => {
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).toContain("stone_financial_schedule");
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).toContain("stone_jumppark_reconciliation");
  });

  it("Financeiro nunca possui clima/CRM entre suas capacidades — nenhuma integração desnecessária é acionada por ele (Sprint 7.0, Z3)", () => {
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).not.toContain("weather_forecast");
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).not.toContain("crm_summary");
  });

  it("Financeiro possui stone_divergences_summary e stone_integration_health (Sprint 7.0, Z4)", () => {
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).toContain("stone_divergences_summary");
    expect(DIRECTOR_REGISTRY.financeiro.ownedCapabilities).toContain("stone_integration_health");
  });

  it("Nenhum outro Diretor possui capacidades Stone (Sprint 7.0, Z4) — exclusivas do Financeiro", () => {
    const stoneCapabilities = ["stone_reconciliation_summary", "stone_financial_schedule", "stone_jumppark_reconciliation", "stone_divergences_summary", "stone_integration_health"];
    for (const [id, director] of Object.entries(DIRECTOR_REGISTRY)) {
      if (id === "financeiro") continue;
      for (const capability of stoneCapabilities) expect(director.ownedCapabilities).not.toContain(capability);
    }
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
