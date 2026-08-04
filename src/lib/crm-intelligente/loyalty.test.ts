import { describe, expect, it } from "vitest";
import { buildLoyaltyCandidates, isLoyaltyCandidate } from "@/lib/crm-intelligente/loyalty";
import type { CustomerOverviewEntry } from "@/lib/crm-intelligente/overview";
import type { Customer } from "@/lib/attendance/types";
import type { CustomerProfile } from "@/lib/crm-intelligente/types";

function makeEntry(overrides: Partial<CustomerProfile> = {}, entryOverrides: Partial<CustomerOverviewEntry> = {}): CustomerOverviewEntry {
  const customer: Customer = { id: "c1", name: "João", phone: "48999999999", cpf: null, email: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const profile: CustomerProfile = {
    customer,
    firstVisitAt: "2026-01-01T00:00:00.000Z",
    daysAsCustomer: 200,
    visitCount: 1,
    vehicleCount: 1,
    lastVisitAt: "2026-06-01T00:00:00.000Z",
    daysSinceLastVisit: 10,
    totalSpent: 100,
    averageTicket: 100,
    isRecurring: false,
    isVip: false,
    ...overrides,
  };
  return {
    customer,
    profile,
    status: "ativo",
    statusReason: "",
    primaryVehicle: null,
    lastServiceNames: [],
    pendingRecommendationsCount: 0,
    lastCourtesy: null,
    ...entryOverrides,
  };
}

describe("isLoyaltyCandidate", () => {
  it("cliente comum (não VIP, não recorrente) não é elegível", () => {
    expect(isLoyaltyCandidate(makeEntry())).toBe(false);
  });

  it("cliente VIP é elegível", () => {
    expect(isLoyaltyCandidate(makeEntry({ isVip: true, visitCount: 6 }))).toBe(true);
  });

  it("cliente recorrente (não VIP) é elegível", () => {
    expect(isLoyaltyCandidate(makeEntry({ isRecurring: true, visitCount: 3 }))).toBe(true);
  });
});

describe("buildLoyaltyCandidates", () => {
  it("filtra só elegíveis e ordena por total gasto decrescente", () => {
    const low = makeEntry({ isRecurring: true, visitCount: 3, totalSpent: 300 }, { customer: { id: "low", name: "Baixo", phone: null, cpf: null, email: null, notes: null, createdAt: "", updatedAt: "" } });
    const high = makeEntry({ isVip: true, visitCount: 6, totalSpent: 900 }, { customer: { id: "high", name: "Alto", phone: null, cpf: null, email: null, notes: null, createdAt: "", updatedAt: "" } });
    const notEligible = makeEntry();

    const result = buildLoyaltyCandidates([low, high, notEligible]);
    expect(result.map((r) => r.entry.customer.id)).toEqual(["high", "low"]);
  });

  it("sugere lavagem de cortesia só para VIP sem cortesia anterior registrada", () => {
    const vip = makeEntry({ isVip: true, visitCount: 6 });
    const [candidate] = buildLoyaltyCandidates([vip]);
    expect(candidate.suggestions.some((s) => s.kind === "lavagem_cortesia")).toBe(true);
  });

  it("nunca sugere lavagem de cortesia repetida quando já houve cortesia recente", () => {
    const vip = makeEntry({ isVip: true, visitCount: 6 }, { lastCourtesy: { description: "Cortesia", grantedAt: "2026-07-01", amount: 80 } });
    const [candidate] = buildLoyaltyCandidates([vip]);
    expect(candidate.suggestions.some((s) => s.kind === "lavagem_cortesia")).toBe(false);
    expect(candidate.suggestions.some((s) => s.kind === "mensagem_agradecimento")).toBe(true);
  });

  it("sempre declara os critérios não rastreados, nunca inventando dado", () => {
    const vip = makeEntry({ isVip: true, visitCount: 6 });
    const [candidate] = buildLoyaltyCandidates([vip]);
    expect(candidate.untrackedCriteria.length).toBeGreaterThan(0);
  });
});
