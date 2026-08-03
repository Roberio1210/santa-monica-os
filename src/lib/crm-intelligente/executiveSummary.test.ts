import { describe, expect, it } from "vitest";
import { buildExecutiveSummary } from "@/lib/crm-intelligente/executiveSummary";
import type { CustomerProfile, SmartRecommendation } from "@/lib/crm-intelligente/types";
import type { Customer } from "@/lib/attendance/types";

function customer(): Customer {
  return { id: "c1", name: "Cliente Teste", phone: null, cpf: null, email: null, notes: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

function profile(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    customer: customer(),
    firstVisitAt: "2026-01-01T00:00:00Z",
    daysAsCustomer: 100,
    visitCount: 4,
    vehicleCount: 1,
    lastVisitAt: "2026-07-01T00:00:00Z",
    daysSinceLastVisit: 30,
    totalSpent: 500,
    averageTicket: 125,
    isRecurring: true,
    isVip: false,
    ...overrides,
  };
}

describe("buildExecutiveSummary", () => {
  it("monta o resumo a partir só do que já foi calculado, sem recalcular nada", () => {
    const recommendations: SmartRecommendation[] = [{ id: "motor", label: "Motor", reason: "Motor muito sujo." }];
    const summary = buildExecutiveSummary({ profile: profile(), activeProtectionsCount: 2, recommendations });

    expect(summary.customerSince).toBe("2026-01-01T00:00:00Z");
    expect(summary.activeProtectionsCount).toBe(2);
    expect(summary.nextRecommendation).toBe("Motor muito sujo.");
  });

  it("próxima recomendação é null quando não há nenhuma — nunca inventa uma sugestão", () => {
    const summary = buildExecutiveSummary({ profile: profile(), activeProtectionsCount: 0, recommendations: [] });
    expect(summary.nextRecommendation).toBeNull();
  });
});
