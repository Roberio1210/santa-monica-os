import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeInactivePriority, DEFAULT_INACTIVE_MIN_DAYS } from "@/lib/management/inactiveCustomers";
import type { CustomerOverviewEntry } from "@/lib/crm-intelligente/overview";
import type { CustomerProfile } from "@/lib/crm-intelligente/types";
import type { Customer } from "@/lib/attendance/types";

const listCustomerOverviewsMock = vi.fn();
vi.mock("@/lib/crm-intelligente/overview", () => ({
  listCustomerOverviews: (...args: unknown[]) => listCustomerOverviewsMock(...args),
}));

function overviewEntry(overrides: Partial<CustomerOverviewEntry> = {}): CustomerOverviewEntry {
  return {
    customer: { id: "c1", name: "Cliente Teste", phone: "48999990000", cpf: null, email: null, notes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    profile: profile(),
    status: "em_risco",
    statusReason: "",
    primaryVehicle: { id: "v1", customerId: "c1", plate: "ABC1D23", brand: "Jeep", model: "Compass", year: 2022, color: "Preto", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    lastServiceNames: ["Bronze"],
    pendingRecommendationsCount: 0,
    lastCourtesy: null,
    ...overrides,
  };
}

function profile(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    customer: { id: "c1", name: "Cliente Teste", phone: "48999990000", cpf: null, email: null, notes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Customer,
    firstVisitAt: "2026-01-01",
    daysAsCustomer: 200,
    visitCount: 1,
    vehicleCount: 1,
    lastVisitAt: "2026-06-01",
    daysSinceLastVisit: 31,
    totalSpent: 0,
    averageTicket: null,
    isRecurring: false,
    isVip: false,
    ...overrides,
  };
}

describe("Missão Z4 — limiar de 30 dias (inativo 31 vs. 29 dias)", () => {
  it("31 dias sem retorno cai dentro do limiar padrão (>= 30)", () => {
    expect(31 >= DEFAULT_INACTIVE_MIN_DAYS).toBe(true);
  });

  it("29 dias sem retorno NUNCA deve ser considerado inativo pelo limiar padrão", () => {
    expect(29 >= DEFAULT_INACTIVE_MIN_DAYS).toBe(false);
  });
});

describe("computeInactivePriority — critérios sempre explícitos, nunca um score opaco", () => {
  it("cliente recorrente + sumiu há pouco tempo + ticket relevante -> pontuação alta com motivos claros", () => {
    const { score, reasons } = computeInactivePriority({ profile: profile({ isRecurring: true, daysSinceLastVisit: 45, totalSpent: 800 }) });
    expect(score).toBe(2 + 2 + 1);
    expect(reasons).toContain("Cliente recorrente");
    expect(reasons.some((r) => r.includes("60 dias"))).toBe(true);
    expect(reasons.some((r) => r.includes("R$500"))).toBe(true);
  });

  it("cliente não recorrente, sumido há muito tempo, sem ticket relevante -> pontuação baixa/zero", () => {
    const { score, reasons } = computeInactivePriority({ profile: profile({ isRecurring: false, daysSinceLastVisit: 400, totalSpent: 50 }) });
    expect(score).toBe(0);
    expect(reasons).toEqual([]);
  });

  it("janela moderada (61-90 dias) soma menos que a janela recente (<=60 dias)", () => {
    const recent = computeInactivePriority({ profile: profile({ daysSinceLastVisit: 50 }) });
    const moderate = computeInactivePriority({ profile: profile({ daysSinceLastVisit: 80 }) });
    expect(recent.score).toBeGreaterThan(moderate.score);
  });
});

describe("fetchInactiveCustomers — mockando a fonte real (listCustomerOverviews)", () => {
  beforeEach(() => listCustomerOverviewsMock.mockReset());

  it("cliente com 29 dias sem retorno NUNCA aparece na lista (limiar padrão é 30)", async () => {
    listCustomerOverviewsMock.mockResolvedValue([overviewEntry({ profile: profile({ daysSinceLastVisit: 29 }) })]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates).toHaveLength(0);
  });

  it("cliente com 31 dias sem retorno aparece na lista", async () => {
    listCustomerOverviewsMock.mockResolvedValue([overviewEntry({ profile: profile({ daysSinceLastVisit: 31 }) })]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].daysSinceLastVisit).toBe(31);
  });

  it("sempre devolve os dois avisos honestos (sem histórico de contato, sem sinalização de restrição/LGPD) — nunca finge ter checado isso", async () => {
    listCustomerOverviewsMock.mockResolvedValue([]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.caveats.length).toBeGreaterThanOrEqual(2);
    expect(result.caveats.join(" ")).toMatch(/hist[óo]rico de mensagens/i);
    expect(result.caveats.join(" ")).toMatch(/reclama[çc][ãa]o|opt-out|LGPD/i);
  });

  it("mensagem de reativação nunca menciona promoção/condição especial (nenhuma promoção real está cadastrada)", async () => {
    listCustomerOverviewsMock.mockResolvedValue([overviewEntry({ profile: profile({ daysSinceLastVisit: 60 }) })]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates[0].messageDraft.toLowerCase()).not.toMatch(/condição especial|promoção|desconto/);
  });

  it("nunca devolve uma lista gigante sem critério — limitada aos melhores candidatos mesmo com muitos inativos", async () => {
    const many = Array.from({ length: 40 }, (_, i) => overviewEntry({ customer: { id: `c${i}`, name: `Cliente ${i}`, phone: null, cpf: null, email: null, notes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }, profile: profile({ daysSinceLastVisit: 40 + i }) }));
    listCustomerOverviewsMock.mockResolvedValue(many);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.totalCandidatesBeforeCap).toBe(40);
    expect(result.candidates.length).toBeLessThan(40);
    expect(result.candidates.length).toBeLessThanOrEqual(12);
  });

  it("telefone e placa nunca aparecem sem máscara", async () => {
    listCustomerOverviewsMock.mockResolvedValue([overviewEntry({ profile: profile({ daysSinceLastVisit: 35 }) })]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates[0].phoneMasked).not.toBe("48999990000");
    expect(result.candidates[0].plateMasked).not.toBe("ABC1D23");
  });

  it("Missão Z5 — cliente com EXATAMENTE 30 dias sem retorno cai dentro do limiar padrão (>=30, nunca >30)", async () => {
    listCustomerOverviewsMock.mockResolvedValue([overviewEntry({ profile: profile({ daysSinceLastVisit: 30 }) })]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].daysSinceLastVisit).toBe(30);
  });

  it("Missão Z5 — cliente sem telefone cadastrado ainda aparece na lista, com telefone_mascarado null (nunca lança, nunca inventa número)", async () => {
    listCustomerOverviewsMock.mockResolvedValue([
      overviewEntry({ customer: { id: "c1", name: "Cliente Sem Telefone", phone: null, cpf: null, email: null, notes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }, profile: profile({ daysSinceLastVisit: 40 }) }),
    ]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].phoneMasked).toBeNull();
    expect(result.candidates[0].customerName).toBe("Cliente Sem Telefone");
  });

  it("Missão Z5 — expõe a data real da última visita (ULTIMA VISITA), nunca só a contagem de dias", async () => {
    listCustomerOverviewsMock.mockResolvedValue([overviewEntry({ profile: profile({ daysSinceLastVisit: 45, lastVisitAt: "2026-07-10T12:00:00.000Z" }) })]);
    const { fetchInactiveCustomers } = await import("@/lib/management/inactiveCustomers");
    const result = await fetchInactiveCustomers();
    expect(result.candidates[0].lastVisitAt).toBe("2026-07-10T12:00:00.000Z");
  });
});
