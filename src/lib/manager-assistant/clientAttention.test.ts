import { describe, expect, it } from "vitest";
import { deriveClientAttention, RECORRENTE_VISIT_THRESHOLD } from "@/lib/manager-assistant/clientAttention";
import type { Customer, CustomerHistorySummary, Vehicle } from "@/lib/attendance/types";

function customer(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "João", phone: "48999990000", cpf: null, email: null, notes: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...overrides };
}

function history(overrides: Partial<CustomerHistorySummary> = {}): CustomerHistorySummary {
  return {
    customer: customer(),
    vehicles: [],
    lastVisitAt: null,
    lastServices: [],
    lastOrderValue: null,
    totalSpent: 0,
    observations: [],
    pendingRecommendations: [],
    activeProtections: [],
    visitCount: 0,
    hasOpenOrder: false,
    purchasedServiceNames: [],
    lastDiagnosticIssues: [],
    ...overrides,
  };
}

const NO_VEHICLES: Vehicle[] = [];

describe("deriveClientAttention", () => {
  it("retorna null quando não há nenhum sinal real, nunca lista todo cliente", () => {
    expect(deriveClientAttention({ customer: customer(), vehicles: NO_VEHICLES, history: history(), visitCount: 1 })).toBeNull();
  });

  it("sinaliza observação registrada no cadastro", () => {
    const entry = deriveClientAttention({ customer: customer({ notes: "Não gosta de cheiro forte" }), vehicles: NO_VEHICLES, history: history(), visitCount: 1 });
    expect(entry?.reasons).toContain("Observação registrada no cadastro");
  });

  it("sinaliza recomendação técnica pendente", () => {
    const entry = deriveClientAttention({
      customer: customer(),
      vehicles: NO_VEHICLES,
      history: history({ pendingRecommendations: [{ id: "r1", serviceVisitId: "v1", category: "motor", observations: null, createdAt: "2026-08-01T00:00:00Z" }] }),
      visitCount: 1,
    });
    expect(entry?.reasons.some((r) => r.includes("recomendação"))).toBe(true);
    expect(entry?.pendingRecommendationsCount).toBe(1);
  });

  it("sinaliza cliente recorrente só a partir do limiar de visitas", () => {
    const abaixo = deriveClientAttention({ customer: customer(), vehicles: NO_VEHICLES, history: history(), visitCount: RECORRENTE_VISIT_THRESHOLD - 1 });
    const noLimiar = deriveClientAttention({ customer: customer(), vehicles: NO_VEHICLES, history: history(), visitCount: RECORRENTE_VISIT_THRESHOLD });
    expect(abaixo).toBeNull();
    expect(noLimiar?.reasons).toContain("Cliente recorrente");
  });

  it("sinaliza observação de diagnóstico anterior", () => {
    const entry = deriveClientAttention({ customer: customer(), vehicles: NO_VEHICLES, history: history({ observations: ["Risco na lateral direita"] }), visitCount: 1 });
    expect(entry?.reasons).toContain("Observação registrada em diagnóstico anterior");
  });
});
