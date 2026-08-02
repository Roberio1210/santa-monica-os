import { describe, expect, it } from "vitest";
import { summarizeCustomerHistory } from "@/lib/attendance/history";
import type { Customer, Diagnostic, ServiceOrder, ServiceVisit, TechnicalRecommendation, Vehicle } from "@/lib/attendance/types";

const customer: Customer = { id: "c1", name: "Fulano", phone: "48999998888", cpf: null, email: null, notes: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const vehicle: Vehicle = { id: "v1", customerId: "c1", plate: "ABC1D23", brand: "Toyota", model: "Corolla Cross", year: 2023, color: "Branco", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

function visit(id: string, createdAt: string): ServiceVisit {
  return { id, customerId: "c1", vehicleId: "v1", mileageAtVisit: 10000, createdAt };
}

function diagnostic(serviceVisitId: string, observations: string | null): Diagnostic {
  return {
    id: `d-${serviceVisitId}`,
    serviceVisitId,
    exterior: {} as Diagnostic["exterior"],
    interior: {} as Diagnostic["interior"],
    observations,
    photos: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function order(serviceVisitId: string, createdAt: string, items: { serviceId: string; serviceName: string }[]): ServiceOrder {
  return {
    id: `o-${serviceVisitId}`,
    serviceVisitId,
    status: "aguardando_execucao",
    items: items.map((i, idx) => ({ id: `oi-${idx}`, serviceOrderId: `o-${serviceVisitId}`, serviceId: i.serviceId, serviceName: i.serviceName, notes: null })),
    createdAt,
    updatedAt: createdAt,
  };
}

describe("summarizeCustomerHistory", () => {
  it("última visita é sempre a mais recente por data, não por ordem de inserção", () => {
    const summary = summarizeCustomerHistory({
      customer,
      vehicles: [vehicle],
      visits: [visit("v-old", "2026-01-01T10:00:00Z"), visit("v-new", "2026-06-01T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [],
      servicePriceById: {},
    });
    expect(summary.lastVisitAt).toBe("2026-06-01T10:00:00Z");
  });

  it("últimos serviços vêm da ordem mais recente, não da primeira", () => {
    const summary = summarizeCustomerHistory({
      customer,
      vehicles: [vehicle],
      visits: [visit("visit-1", "2026-01-01T10:00:00Z"), visit("visit-2", "2026-06-01T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [order("visit-1", "2026-01-01T11:00:00Z", [{ serviceId: "s1", serviceName: "Lavação" }]), order("visit-2", "2026-06-01T11:00:00Z", [{ serviceId: "s2", serviceName: "Vitrificação" }])],
      servicePriceById: {},
    });
    expect(summary.lastServices).toEqual(["Vitrificação"]);
  });

  it("valor gasto soma o preço de todos os serviços de todas as ordens", () => {
    const summary = summarizeCustomerHistory({
      customer,
      vehicles: [vehicle],
      visits: [visit("visit-1", "2026-01-01T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [order("visit-1", "2026-01-01T11:00:00Z", [{ serviceId: "s1", serviceName: "Lavação" }, { serviceId: "s2", serviceName: "Cera" }])],
      servicePriceById: { s1: 80, s2: 50 },
    });
    expect(summary.totalSpent).toBe(130);
  });

  it("serviço sem preço cadastrado conta como 0, nunca inventa valor", () => {
    const summary = summarizeCustomerHistory({
      customer,
      vehicles: [vehicle],
      visits: [visit("visit-1", "2026-01-01T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [order("visit-1", "2026-01-01T11:00:00Z", [{ serviceId: "sem-preco", serviceName: "Serviço novo" }])],
      servicePriceById: {},
    });
    expect(summary.totalSpent).toBe(0);
  });

  it("observações filtram diagnósticos sem texto", () => {
    const summary = summarizeCustomerHistory({
      customer,
      vehicles: [vehicle],
      visits: [visit("visit-1", "2026-01-01T10:00:00Z")],
      diagnostics: [diagnostic("visit-1", "Pintura com riscos leves"), diagnostic("visit-1", null), diagnostic("visit-1", "   ")],
      recommendations: [],
      orders: [],
      servicePriceById: {},
    });
    expect(summary.observations).toEqual(["Pintura com riscos leves"]);
  });

  it("recomendação pendente é a de uma visita sem nenhuma ordem criada", () => {
    const rec1: TechnicalRecommendation = { id: "r1", serviceVisitId: "visit-1", category: "vitrificacao", observations: null, createdAt: "2026-01-01T10:00:00Z" };
    const rec2: TechnicalRecommendation = { id: "r2", serviceVisitId: "visit-2", category: "polimento", observations: null, createdAt: "2026-02-01T10:00:00Z" };
    const summary = summarizeCustomerHistory({
      customer,
      vehicles: [vehicle],
      visits: [visit("visit-1", "2026-01-01T10:00:00Z"), visit("visit-2", "2026-02-01T10:00:00Z")],
      diagnostics: [],
      recommendations: [rec1, rec2],
      orders: [order("visit-1", "2026-01-01T11:00:00Z", [{ serviceId: "s1", serviceName: "Vitrificação" }])],
      servicePriceById: {},
    });
    expect(summary.pendingRecommendations).toEqual([rec2]);
  });

  it("proteções vigentes é sempre [] nesta sprint — nunca inventa data de validade", () => {
    const summary = summarizeCustomerHistory({ customer, vehicles: [vehicle], visits: [], diagnostics: [], recommendations: [], orders: [], servicePriceById: {} });
    expect(summary.activeProtections).toEqual([]);
  });
});
