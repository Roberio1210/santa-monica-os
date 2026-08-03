import { describe, expect, it } from "vitest";
import { buildCrmTimeline } from "@/lib/crm-intelligente/timeline";
import { emptyTechnicalDiagnostic, type Diagnostic, type ServiceOrder, type ServiceVisit, type TechnicalRecommendation } from "@/lib/attendance/types";
import type { Discount } from "@/lib/manager-assistant/types";

function visit(id: string, createdAt: string): ServiceVisit {
  return { id, customerId: "c1", vehicleId: "v1", mileageAtVisit: null, createdAt };
}

function diagnostic(id: string, serviceVisitId: string): Diagnostic {
  return { id, serviceVisitId, ...emptyTechnicalDiagnostic(), observations: "Cliente pediu atenção no banco traseiro.", photos: [{ id: "p1", area: "interior", url: null, caption: "Antes" }], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

function order(id: string, serviceVisitId: string, status: ServiceOrder["status"], updatedAt: string): ServiceOrder {
  return { id, serviceVisitId, status, items: [{ id: `${id}-item`, serviceOrderId: id, serviceId: "svc1", serviceName: "Bronze", notes: null }], createdAt: "2026-01-01T00:00:00Z", updatedAt };
}

function recommendation(id: string, serviceVisitId: string): TechnicalRecommendation {
  return { id, serviceVisitId, category: "motor", observations: "Motor sujo", createdAt: "2026-01-01T00:00:00Z" };
}

function discount(id: string, serviceOrderId: string): Discount {
  return { id, serviceOrderId, originalValue: 100, finalValue: 90, discountAmount: 10, discountPercent: 10, reason: "recorrente", appliedBy: "Gerente", notes: null, createdAt: "2026-01-01T00:00:00Z" };
}

describe("buildCrmTimeline", () => {
  it("mais recente primeiro, com todos os dados reais ligados pela visita", () => {
    const visits = [visit("visit1", "2026-01-01T10:00:00Z"), visit("visit2", "2026-02-01T10:00:00Z")];
    const diagnostics = [diagnostic("d1", "visit1")];
    const orders = [order("o1", "visit1", "entregue", "2026-01-01T12:00:00Z")];
    const recommendations = [recommendation("r1", "visit1")];
    const discounts = [discount("desc1", "o1")];

    const entries = buildCrmTimeline({ visits, diagnostics, recommendations, orders, discounts });

    expect(entries.map((e) => e.visitId)).toEqual(["visit2", "visit1"]);

    const entry1 = entries.find((e) => e.visitId === "visit1")!;
    expect(entry1.services).toEqual(["Bronze"]);
    expect(entry1.diagnosticObservations).toBe("Cliente pediu atenção no banco traseiro.");
    expect(entry1.photos).toEqual([{ area: "interior", caption: "Antes" }]);
    expect(entry1.recommendations).toEqual([{ category: "motor", observations: "Motor sujo" }]);
    expect(entry1.discounts).toEqual([discount("desc1", "o1")]);
    expect(entry1.status).toBe("entregue");
    // 2h entre entrada (10:00) e entrega (12:00)
    expect(entry1.executionMinutes).toBe(120);
  });

  it("visita sem ordem/diagnóstico nunca inventa dado — tudo vazio/null", () => {
    const entries = buildCrmTimeline({ visits: [visit("visit1", "2026-01-01T10:00:00Z")], diagnostics: [], recommendations: [], orders: [], discounts: [] });
    const [entry] = entries;
    expect(entry.services).toEqual([]);
    expect(entry.diagnosticIssues).toEqual([]);
    expect(entry.diagnosticObservations).toBeNull();
    expect(entry.photos).toEqual([]);
    expect(entry.discounts).toEqual([]);
    expect(entry.executionMinutes).toBeNull();
    expect(entry.status).toBeNull();
  });

  it("tempo de execução só é calculado quando a ordem já está entregue", () => {
    const entries = buildCrmTimeline({
      visits: [visit("visit1", "2026-01-01T10:00:00Z")],
      diagnostics: [],
      recommendations: [],
      orders: [order("o1", "visit1", "em_execucao", "2026-01-01T11:00:00Z")],
      discounts: [],
    });
    expect(entries[0].executionMinutes).toBeNull();
  });
});
