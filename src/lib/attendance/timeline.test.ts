import { describe, expect, it } from "vitest";
import { summarizeTimeline } from "@/lib/attendance/timeline";
import { emptyTechnicalDiagnostic, type Diagnostic, type ServiceOrder, type ServiceVisit, type TechnicalRecommendation } from "@/lib/attendance/types";

function visit(id: string, createdAt: string): ServiceVisit {
  return { id, customerId: "c1", vehicleId: "v1", mileageAtVisit: null, createdAt };
}

function diagnostic(serviceVisitId: string, observations: string | null): Diagnostic {
  return {
    id: `d-${serviceVisitId}`,
    serviceVisitId,
    ...emptyTechnicalDiagnostic(),
    observations,
    photos: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function order(serviceVisitId: string, items: { serviceId: string; serviceName: string }[]): ServiceOrder {
  return {
    id: `o-${serviceVisitId}`,
    serviceVisitId,
    status: "aguardando_execucao",
    items: items.map((i, idx) => ({ id: `oi-${idx}`, serviceOrderId: `o-${serviceVisitId}`, serviceId: i.serviceId, serviceName: i.serviceName, notes: null })),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("summarizeTimeline", () => {
  it("ordena as visitas da mais recente para a mais antiga", () => {
    const entries = summarizeTimeline({
      visits: [visit("v-old", "2026-06-22T10:00:00Z"), visit("v-new", "2026-07-10T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [],
      servicePriceById: {},
    });
    expect(entries.map((e) => e.visitId)).toEqual(["v-new", "v-old"]);
  });

  it("junta serviços, valor, categoria de recomendação e observação da mesma visita", () => {
    const rec: TechnicalRecommendation = { id: "r1", serviceVisitId: "visit-1", category: "motor", observations: null, createdAt: "2026-01-01T00:00:00Z" };
    const entries = summarizeTimeline({
      visits: [visit("visit-1", "2026-07-10T10:00:00Z")],
      diagnostics: [diagnostic("visit-1", "Cliente relatou barulho no motor.")],
      recommendations: [rec],
      orders: [order("visit-1", [{ serviceId: "s1", serviceName: "Lavação Gold" }])],
      servicePriceById: { s1: 420 },
    });
    expect(entries).toEqual([
      {
        visitId: "visit-1",
        date: "2026-07-10T10:00:00Z",
        services: ["Lavação Gold"],
        recommendationCategories: ["motor"],
        value: 420,
        observations: "Cliente relatou barulho no motor.",
      },
    ]);
  });

  it("valor é null quando a visita ainda não tem ordem com itens — nunca inventa 0 nem soma vazia", () => {
    const entries = summarizeTimeline({
      visits: [visit("visit-1", "2026-07-10T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [],
      servicePriceById: {},
    });
    expect(entries[0].value).toBeNull();
    expect(entries[0].services).toEqual([]);
  });

  it("serviço sem preço cadastrado conta como 0 na soma, nunca inventa valor", () => {
    const entries = summarizeTimeline({
      visits: [visit("visit-1", "2026-07-10T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [order("visit-1", [{ serviceId: "sem-preco", serviceName: "Serviço novo" }])],
      servicePriceById: {},
    });
    expect(entries[0].value).toBe(0);
  });
});
