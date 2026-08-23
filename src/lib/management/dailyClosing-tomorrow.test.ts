import { describe, expect, it, vi } from "vitest";
import type { AppointmentView, PlanningBoard } from "@/lib/planning/types";
import type { ServiceCatalogEntry } from "@/lib/services/catalog";

/**
 * Missão Z4, seção 9 — "produto x agenda": cruza os serviços agendados de amanhã (fonte real:
 * `fetchPlanningBoard`, mesma de `/planejamento`) com os produtos homologados x estoque real do
 * catálogo (fonte real: `fetchServiceCatalog`, Missão Z3.3). Mockadas aqui para travar as duas
 * pontas do cruzamento sem precisar de banco — nunca inventa agenda nem estoque.
 */

const fetchPlanningBoardMock = vi.fn();
const fetchServiceCatalogMock = vi.fn();

vi.mock("@/lib/planning/service", () => ({
  fetchPlanningBoard: (...args: unknown[]) => fetchPlanningBoardMock(...args),
}));
vi.mock("@/lib/services/catalog", () => ({
  fetchServiceCatalog: (...args: unknown[]) => fetchServiceCatalogMock(...args),
}));

function appointment(overrides: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: "a1",
    scheduledAt: "2026-08-24T14:00:00.000Z",
    status: "agendado",
    customerId: "c1",
    customerName: "Cliente",
    phone: null,
    vehicleId: "v1",
    vehicleLabel: "Onix",
    plate: null,
    serviceId: "s1",
    serviceName: "Vitrificação",
    expectedDurationMinutes: 180,
    notes: null,
    signals: [],
    ...overrides,
  };
}

function board(appointments: AppointmentView[]): PlanningBoard {
  return {
    days: [{ dateIso: "2026-08-24", label: "Amanhã", appointments }],
    tomorrowPreparation: {
      vehicleCount: appointments.length,
      serviceCount: appointments.length,
      totalPredictedMinutes: 0,
      appointmentsMissingDuration: 0,
      capacity: { configured: true, boxesCount: 2, dailyOperatingMinutes: 600, dailyCapacityMinutes: 1200, committedMinutes: 300, availableMinutes: 900, percentOccupied: 25, estimatedBoxesOccupied: 1, appointmentsMissingDuration: 0 },
      forecast: { calculable: false },
    },
    nextClient: null,
  };
}

function catalogEntry(overrides: Partial<ServiceCatalogEntry> = {}): ServiceCatalogEntry {
  return {
    id: "svc",
    name: "Vitrificação",
    category: "Vitrificação",
    defaultPrice: null,
    currentPrice: null,
    priceVariants: [],
    shortDescription: null,
    detailedDescription: null,
    estimatedDurationMinutes: null,
    benefits: null,
    indications: null,
    restrictions: null,
    requiresInspection: false,
    operationalSteps: [],
    products: [],
    ...overrides,
  };
}

describe("buildTomorrowSummary — produto homologado x estoque real para os serviços de amanhã", () => {
  it("serviço agendado amanhã com produto homologado disponível -> risco 'disponivel'", async () => {
    fetchPlanningBoardMock.mockResolvedValue(board([appointment({ serviceName: "Vitrificação" })]));
    fetchServiceCatalogMock.mockResolvedValue([
      catalogEntry({
        products: [{ productName: "CC Pro Sonax", brand: "Sonax", role: "Vitrificador 4 anos", isAlternative: false, variantLabel: "4 anos", durabilityLabel: null, estoque: { quantidadeAtual: 37.5, unidade: "ml", disponivel: true, status: "ok" } }],
      }),
    ]);
    const { buildTomorrowSummary } = await import("@/lib/management/dailyClosing");
    const result = await buildTomorrowSummary();
    const risk = result.productRisks.find((r) => r.serviceName === "Vitrificação");
    expect(risk?.status).toBe("disponivel");
    expect(risk?.detail).toContain("CC Pro Sonax");
  });

  it("serviço agendado amanhã SEM produto homologado disponível -> risco 'indisponivel', nunca substitui silenciosamente", async () => {
    fetchPlanningBoardMock.mockResolvedValue(board([appointment({ serviceName: "Vitrificação de Couro" })]));
    fetchServiceCatalogMock.mockResolvedValue([
      catalogEntry({
        name: "Vitrificação de Couro",
        products: [{ productName: "V-Leather", brand: "Vonixx", role: "Vitrificador de couro", isAlternative: false, variantLabel: null, durabilityLabel: "~1 ano", estoque: null }],
      }),
    ]);
    const { buildTomorrowSummary } = await import("@/lib/management/dailyClosing");
    const result = await buildTomorrowSummary();
    const risk = result.productRisks.find((r) => r.serviceName === "Vitrificação de Couro");
    expect(risk?.status).toBe("indisponivel");
    expect(risk?.detail).toMatch(/nenhum produto homologado dispon[íi]vel/i);
  });

  it("serviço agendado sem nenhum produto homologado cadastrado -> nunca inventa risco (não aparece na lista)", async () => {
    fetchPlanningBoardMock.mockResolvedValue(board([appointment({ serviceName: "Lavação Interna" })]));
    fetchServiceCatalogMock.mockResolvedValue([catalogEntry({ name: "Lavação Interna", products: [] })]);
    const { buildTomorrowSummary } = await import("@/lib/management/dailyClosing");
    const result = await buildTomorrowSummary();
    expect(result.productRisks.find((r) => r.serviceName === "Lavação Interna")).toBeUndefined();
  });

  it("agenda de amanhã vazia -> nunca lança, capacidade e serviços refletem zero real", async () => {
    fetchPlanningBoardMock.mockResolvedValue(board([]));
    fetchServiceCatalogMock.mockResolvedValue([]);
    const { buildTomorrowSummary } = await import("@/lib/management/dailyClosing");
    const result = await buildTomorrowSummary();
    expect(result.vehicleCount).toBe(0);
    expect(result.mainServices).toEqual([]);
    expect(result.productRisks).toEqual([]);
  });
});
