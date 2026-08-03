import { describe, expect, it } from "vitest";
import { buildSmartRecommendations } from "@/lib/crm-intelligente/recommendations";
import { emptyTechnicalDiagnostic, type Diagnostic } from "@/lib/attendance/types";
import type { CrmTimelineEntry } from "@/lib/crm-intelligente/types";

const NOW = new Date("2026-08-03T12:00:00Z");

function diagnostic(overrides: Partial<Diagnostic["interior"]> = {}, vidros: Partial<Diagnostic["vidros"]> = {}): Diagnostic {
  const base = emptyTechnicalDiagnostic();
  return { id: "d1", serviceVisitId: "visit1", ...base, interior: { ...base.interior, ...overrides }, vidros: { ...base.vidros, ...vidros }, observations: null, photos: [], createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" };
}

function entry(overrides: Partial<CrmTimelineEntry>): CrmTimelineEntry {
  return {
    visitId: "visit1",
    vehicleId: "v1",
    dateIso: "2026-01-01T00:00:00Z",
    services: [],
    diagnosticIssues: [],
    diagnosticObservations: null,
    photos: [],
    recommendations: [],
    discounts: [],
    executionMinutes: null,
    status: "entregue",
    ...overrides,
  };
}

describe("buildSmartRecommendations", () => {
  it("recomenda hidratação com motivo real quando couro foi diagnosticado ressecado", () => {
    const recs = buildSmartRecommendations({ latestDiagnostic: diagnostic({ couro: true }), timeline: [], now: NOW });
    const hidratacao = recs.find((r) => r.id === "hidratacao_couro");
    expect(hidratacao).toBeDefined();
    expect(hidratacao!.reason).toContain("Couro ressecado");
  });

  it("recomenda cristalização de vidros com motivo real quando há contaminação diagnosticada", () => {
    const recs = buildSmartRecommendations({ latestDiagnostic: diagnostic({}, { contaminacao: true }), timeline: [], now: NOW });
    expect(recs.find((r) => r.id === "cristalizacao_vidros")).toBeDefined();
  });

  it("sem diagnóstico, nenhuma recomendação de evidência é gerada", () => {
    const recs = buildSmartRecommendations({ latestDiagnostic: null, timeline: [], now: NOW });
    expect(recs).toEqual([]);
  });

  it("recomenda recorrência de motor só quando já passou do limiar e o serviço já foi feito antes", () => {
    const timeline = [entry({ dateIso: "2026-01-01T00:00:00Z", services: ["Lavagem de Motor"] })];
    const recs = buildSmartRecommendations({ latestDiagnostic: null, timeline, now: NOW });
    const motor = recs.find((r) => r.id === "recorrencia_lavagem_de_motor");
    expect(motor).toBeDefined();
    expect(motor!.reason).toMatch(/dias/);
  });

  it("nunca recomenda recorrência de um serviço que o cliente nunca comprou", () => {
    const recs = buildSmartRecommendations({ latestDiagnostic: null, timeline: [], now: NOW });
    expect(recs.find((r) => r.id.startsWith("recorrencia_"))).toBeUndefined();
  });

  it("não recomenda recorrência quando o serviço foi feito recentemente (abaixo do limiar)", () => {
    const timeline = [entry({ dateIso: "2026-08-01T00:00:00Z", services: ["Lavagem de Motor"] })];
    const recs = buildSmartRecommendations({ latestDiagnostic: null, timeline, now: NOW });
    expect(recs.find((r) => r.id === "recorrencia_lavagem_de_motor")).toBeUndefined();
  });
});
