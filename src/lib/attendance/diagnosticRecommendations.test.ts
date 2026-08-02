import { describe, expect, it } from "vitest";
import { countSignificantIssues, deriveDiagnosticSuggestions, shouldSuggestPackageUpgrade, SIGNIFICANT_ISSUE_THRESHOLD } from "@/lib/attendance/diagnosticRecommendations";
import { emptyTechnicalDiagnostic, type TechnicalDiagnosticInput } from "@/lib/attendance/types";

function diagnostic(overrides: Partial<TechnicalDiagnosticInput> = {}): TechnicalDiagnosticInput {
  return { ...emptyTechnicalDiagnostic(), ...overrides };
}

describe("deriveDiagnosticSuggestions", () => {
  it("diagnóstico totalmente limpo não gera nenhuma sugestão", () => {
    expect(deriveDiagnosticSuggestions(diagnostic())).toEqual([]);
  });

  it("chuva ácida gera sugestão de remoção de chuva ácida", () => {
    const d = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, chuvaAcida: "leve" } });
    const suggestions = deriveDiagnosticSuggestions(d);
    expect(suggestions.some((s) => s.id === "chuva_acida")).toBe(true);
  });

  it("chuva ácida 'nenhuma' não gera sugestão", () => {
    const d = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, chuvaAcida: "nenhuma" } });
    expect(deriveDiagnosticSuggestions(d).some((s) => s.id === "chuva_acida")).toBe(false);
  });

  it("riscos ou hologramas geram sugestão de polimento", () => {
    const comRiscos = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, riscos: "media" } });
    expect(deriveDiagnosticSuggestions(comRiscos).some((s) => s.id === "polimento")).toBe(true);

    const comHologramas = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, hologramas: "alta" } });
    expect(deriveDiagnosticSuggestions(comHologramas).some((s) => s.id === "polimento")).toBe(true);
  });

  it("vidro contaminado gera sugestão de cristalização de vidros", () => {
    const d = diagnostic({ vidros: { ...emptyTechnicalDiagnostic().vidros, contaminacao: true } });
    expect(deriveDiagnosticSuggestions(d).some((s) => s.id === "cristalizacao_vidros")).toBe(true);
  });

  it("marcas d'água sozinhas não geram sugestão de cristalização (sem serviço correspondente claro)", () => {
    const d = diagnostic({ vidros: { ...emptyTechnicalDiagnostic().vidros, marcasDagua: true } });
    expect(deriveDiagnosticSuggestions(d)).toEqual([]);
  });

  it("couro ressecado gera sugestão de hidratação de couro", () => {
    const d = diagnostic({ interior: { ...emptyTechnicalDiagnostic().interior, couro: true } });
    expect(deriveDiagnosticSuggestions(d).some((s) => s.id === "hidratacao_couro")).toBe(true);
  });

  it("motor muito sujo gera sugestão de lavagem de motor", () => {
    const d = diagnostic({ motor: { condition: "muito_sujo" } });
    expect(deriveDiagnosticSuggestions(d).some((s) => s.id === "motor")).toBe(true);
  });

  it("motor sujo (não só muito sujo) também gera sugestão de lavagem de motor", () => {
    const d = diagnostic({ motor: { condition: "sujo" } });
    expect(deriveDiagnosticSuggestions(d).some((s) => s.id === "motor")).toBe(true);
  });

  it("motor normal ou muito limpo não gera sugestão", () => {
    expect(deriveDiagnosticSuggestions(diagnostic({ motor: { condition: "normal" } })).some((s) => s.id === "motor")).toBe(false);
    expect(deriveDiagnosticSuggestions(diagnostic({ motor: { condition: "muito_limpo" } })).some((s) => s.id === "motor")).toBe(false);
  });

  it("contaminação geral do interior gera sugestão de higienização", () => {
    const d = diagnostic({ interior: { ...emptyTechnicalDiagnostic().interior, odor: true } });
    expect(deriveDiagnosticSuggestions(d).some((s) => s.id === "higienizacao")).toBe(true);
  });

  it("plásticos/teto/porta-malas/vidros internos sozinhos não geram sugestão (sem serviço correspondente claro)", () => {
    const d = diagnostic({ interior: { ...emptyTechnicalDiagnostic().interior, plasticos: true, teto: true, portaMalas: true, vidrosInternos: true } });
    expect(deriveDiagnosticSuggestions(d)).toEqual([]);
  });

  it("rodas nunca geram sugestão nesta sprint (sem serviço correspondente no catálogo)", () => {
    const d = diagnostic({ rodas: { sujeiraPesada: true, contaminacao: true, oxidacao: true, freioImpregnado: true } });
    expect(deriveDiagnosticSuggestions(d)).toEqual([]);
  });

  it("combina múltiplas sugestões reais sem duplicar nem inventar", () => {
    const d = diagnostic({
      pintura: { chuvaAcida: "alta", riscos: "nenhuma", hologramas: "nenhuma", manchas: "nenhuma" },
      vidros: { contaminacao: true, marcasDagua: false, cristalizacaoExistente: false },
      interior: { ...emptyTechnicalDiagnostic().interior, couro: true },
    });
    const ids = deriveDiagnosticSuggestions(d).map((s) => s.id);
    expect(ids.sort()).toEqual(["chuva_acida", "cristalizacao_vidros", "hidratacao_couro"].sort());
  });
});

describe("countSignificantIssues / shouldSuggestPackageUpgrade", () => {
  it("diagnóstico limpo conta zero e nunca sugere upgrade", () => {
    expect(countSignificantIssues(diagnostic())).toBe(0);
    expect(shouldSuggestPackageUpgrade(diagnostic())).toBe(false);
  });

  it("abaixo do limiar não sugere upgrade", () => {
    const d = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, chuvaAcida: "leve" }, vidros: { ...emptyTechnicalDiagnostic().vidros, contaminacao: true } });
    expect(countSignificantIssues(d)).toBe(2);
    expect(countSignificantIssues(d)).toBeLessThan(SIGNIFICANT_ISSUE_THRESHOLD);
    expect(shouldSuggestPackageUpgrade(d)).toBe(false);
  });

  it("no limiar sugere upgrade", () => {
    const d = diagnostic({
      pintura: { ...emptyTechnicalDiagnostic().pintura, chuvaAcida: "leve" },
      vidros: { ...emptyTechnicalDiagnostic().vidros, contaminacao: true },
      rodas: { ...emptyTechnicalDiagnostic().rodas, oxidacao: true },
    });
    expect(countSignificantIssues(d)).toBe(SIGNIFICANT_ISSUE_THRESHOLD);
    expect(shouldSuggestPackageUpgrade(d)).toBe(true);
  });

  it("riscos/hologramas 'leve' não contam como significativos, mas 'media'/'alta' contam", () => {
    const leve = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, riscos: "leve" } });
    expect(countSignificantIssues(leve)).toBe(0);

    const media = diagnostic({ pintura: { ...emptyTechnicalDiagnostic().pintura, riscos: "media" } });
    expect(countSignificantIssues(media)).toBe(1);
  });

  it("cada flag de interior marcada soma um ponto", () => {
    const d = diagnostic({ interior: { ...emptyTechnicalDiagnostic().interior, couro: true, tecidos: true, odor: true } });
    expect(countSignificantIssues(d)).toBe(3);
    expect(shouldSuggestPackageUpgrade(d)).toBe(true);
  });
});
