import { describe, expect, it } from "vitest";
import { buildFindings, type InsightsInput } from "@/lib/painel-gerencial/insights";
import type { CustomerAggregate, ExpensesSummary, ManagementIndicators, ManagementOrderRow } from "@/lib/painel-gerencial/types";

function indicators(overrides: Partial<ManagementIndicators> = {}): ManagementIndicators {
  return {
    grossRevenue: 1000,
    discountTotal: 0,
    netRevenue: 1000,
    ordersCount: 10,
    vehiclesCount: 10,
    customersCount: 8,
    averageTicket: 100,
    receivedAmount: 1000,
    pendingAmount: 0,
    ...overrides,
  };
}

function emptyExpenses(overrides: Partial<ExpensesSummary> = {}): ExpensesSummary {
  return { total: 0, count: 0, topCategory: null, topSupplier: null, overdueCount: 0, upcomingCount: 0, paidCount: 0, unpaidCount: 0, hasData: false, ...overrides };
}

function baseInput(overrides: Partial<InsightsInput> = {}): InsightsInput {
  const row = { date: "2026-07-20" } as ManagementOrderRow;
  return {
    periodLabel: "Mês atual",
    currentRows: [row],
    currentIndicators: indicators(),
    previousIndicators: indicators(),
    currentServices: [],
    currentCustomers: [],
    previousCustomers: [],
    currentExpenses: emptyExpenses(),
    previousExpenses: emptyExpenses(),
    ...overrides,
  };
}

describe("buildFindings — períodos sem dados", () => {
  it("período sem nenhum atendimento retorna apenas a observação de dados insuficientes", () => {
    const findings = buildFindings(baseInput({ currentRows: [] }));
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("no-data");
  });
});

describe("buildFindings — queda de faturamento", () => {
  it("aponta queda quando a variação é maior que o limiar", () => {
    const findings = buildFindings(baseInput({ currentIndicators: indicators({ netRevenue: 500 }), previousIndicators: indicators({ netRevenue: 1000 }) }));
    const finding = findings.find((f) => f.id === "revenue-variation");
    expect(finding?.severity).toBe("warning");
    expect(finding?.title).toContain("Queda");
  });

  it("não gera achado quando a variação é pequena", () => {
    const findings = buildFindings(baseInput({ currentIndicators: indicators({ netRevenue: 1020 }), previousIndicators: indicators({ netRevenue: 1000 }) }));
    expect(findings.find((f) => f.id === "revenue-variation")).toBeUndefined();
  });
});

describe("buildFindings — despesas superiores ao faturamento", () => {
  it("aponta quando despesas registradas excedem o faturamento líquido do período", () => {
    const findings = buildFindings(
      baseInput({ currentIndicators: indicators({ netRevenue: 500 }), currentExpenses: emptyExpenses({ total: 800, hasData: true }) }),
    );
    const finding = findings.find((f) => f.id === "expenses-exceed-revenue");
    expect(finding?.severity).toBe("critical");
  });

  it("não aponta quando não há despesas suficientes registradas", () => {
    const findings = buildFindings(baseInput({ currentExpenses: emptyExpenses({ hasData: false }) }));
    expect(findings.find((f) => f.id === "expenses-exceed-revenue")).toBeUndefined();
  });
});

describe("buildFindings — cliente relevante sem retorno", () => {
  it("aponta quando um dos 3 maiores clientes do período anterior não voltou", () => {
    const bigSpender: CustomerAggregate = {
      customerId: "c1",
      name: "Cliente Grande",
      phone: "48999990000",
      vehicleModel: "Civic",
      licensePlate: "ABC1234",
      visits: 3,
      totalSpent: 900,
      averageTicket: 300,
      lastVisit: "2026-06-15",
      services: ["Lavação"],
    };
    const findings = buildFindings(baseInput({ previousCustomers: [bigSpender], currentCustomers: [] }));
    expect(findings.find((f) => f.id === "inactive-relevant-customer")).toBeDefined();
  });
});
