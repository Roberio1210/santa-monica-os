import { describe, expect, it } from "vitest";
import { isQuestionBlockedForRole, isToolBlockedForRole, redactToolResultForRole, resolveZezinhoCallerRole, ZEZINHO_RESTRICTION_MESSAGE } from "@/lib/zezinho/auth/access";
import type { CurrentUser } from "@/lib/auth/session";
import type { ToolResult } from "@/lib/zezinho/tools/types";

/**
 * Missão Z1 — testes de unidade do módulo central de RBAC do Zézinho. A ponta a ponta (sessão ->
 * rota -> pipeline -> ferramentas, perguntas obrigatórias, testes adversariais) fica em
 * `service.rbac.test.ts` — aqui só a lógica pura de resolução de papel/bloqueio/redação.
 */

function adminUser(): CurrentUser {
  return { id: "u1", email: "admin@santamonica.com", name: "Admin", role: "admin" };
}

function operationalUser(): CurrentUser {
  return { id: "u2", email: "op@santamonica.com", name: "Operacional", role: "operacional" };
}

describe("resolveZezinhoCallerRole — a role nunca vem de outro lugar que não a sessão", () => {
  it("usuário admin autenticado -> admin", () => {
    expect(resolveZezinhoCallerRole(adminUser())).toBe("admin");
  });

  it("usuário operacional autenticado -> operacional", () => {
    expect(resolveZezinhoCallerRole(operationalUser())).toBe("operacional");
  });

  it("sem sessão nenhuma (null) -> operacional, NUNCA admin — autorização vem da sessão, nunca da ausência dela", () => {
    expect(resolveZezinhoCallerRole(null)).toBe("operacional");
  });
});

describe("isToolBlockedForRole — ferramentas inteiramente financeiras/estratégicas", () => {
  const ADMIN_ONLY = [
    "cash_ledger_totals",
    "dre_result",
    "central_alerts",
    "full_period_comparison",
    "goal_progress",
    "accounts_payable",
    "accounts_receivable",
    "marketing_summary",
    "stone_reconciliation_summary",
    "stone_financial_schedule",
    "stone_jumppark_reconciliation",
    "stone_divergences_summary",
    "stone_integration_health",
    "financial_intelligence",
  ] as const;

  it.each(ADMIN_ONLY)("%s é bloqueada para operacional, nunca para admin", (id) => {
    expect(isToolBlockedForRole(id, "operacional")).toBe(true);
    expect(isToolBlockedForRole(id, "admin")).toBe(false);
  });

  const ALWAYS_ALLOWED = ["jumppark_period_summary", "jumppark_wash_packages", "crm_customers", "inventory_overview", "weather_forecast", "historical_pattern", "situational_context", "unanswered_clients", "agenda_summary"] as const;

  it.each(ALWAYS_ALLOWED)("%s nunca é bloqueada por completo (pode ser redigida, nunca recusada inteira)", (id) => {
    expect(isToolBlockedForRole(id, "operacional")).toBe(false);
  });
});

describe("isQuestionBlockedForRole — segundo pipeline (answerQuestion), gate próprio", () => {
  it("faturamento_hoje bloqueado para operacional, permitido para admin", () => {
    expect(isQuestionBlockedForRole("faturamento_hoje", "operacional")).toBe(true);
    expect(isQuestionBlockedForRole("faturamento_hoje", "admin")).toBe(false);
  });

  it("carros_por_pacote (só contagem) nunca é bloqueada", () => {
    expect(isQuestionBlockedForRole("carros_por_pacote", "operacional")).toBe(false);
  });
});

describe("redactToolResultForRole — nunca redige para admin, redige campo a campo para operacional", () => {
  it("jumppark_period_summary: remove métricas 'currency', preserva 'count', zera topServicesA (tem amount)", () => {
    const result: ToolResult = {
      id: "jumppark_period_summary",
      source: "JumpPark",
      error: null,
      status: "ok",
      collectedAt: "2026-08-22T00:00:00.000Z",
      limitations: [],
      jumpparkConfigured: true,
      metrics: [
        { key: "revenue", label: "Faturamento", unit: "currency", a: 1000, b: null, comparison: { trend: "estavel", deltaPercent: null, direction: "neutro" } as never, source: "JumpPark" },
        { key: "vehicles", label: "Veículos", unit: "count", a: 12, b: null, comparison: { trend: "estavel", deltaPercent: null, direction: "neutro" } as never, source: "JumpPark" },
      ],
      peakHourA: null,
      peakHourB: null,
      topServicesA: [{ description: "Lavação Gold", amount: 80 }],
    };

    const admin = redactToolResultForRole(result, "admin");
    expect(admin).toBe(result);

    const operational = redactToolResultForRole(result, "operacional") as typeof result;
    expect(operational.metrics.map((m) => m.key)).toEqual(["vehicles"]);
    expect(operational.topServicesA).toEqual([]);
  });

  it("inventory_overview: zera totalStockValue (custo agregado), preserva o resto (quantidades)", () => {
    const result: ToolResult = {
      id: "inventory_overview",
      source: "Estoque",
      error: null,
      status: "ok",
      collectedAt: "2026-08-22T00:00:00.000Z",
      limitations: [],
      summary: { totalItems: 82, lowStockCount: 3, nearEmptyCount: 1, sealedCount: 5, totalStockValue: 45210.5, itemsWithoutMinimum: 2 },
    };

    const operational = redactToolResultForRole(result, "operacional") as typeof result;
    expect(operational.summary.totalStockValue).toBeNull();
    expect(operational.summary.totalItems).toBe(82);
    expect(operational.summary.lowStockCount).toBe(3);
  });

  it("historical_pattern: zera typicalRevenue/typicalTicket, preserva contagens", () => {
    const result: ToolResult = {
      id: "historical_pattern",
      source: "JumpPark — histórico",
      error: null,
      status: "ok",
      collectedAt: "2026-08-22T00:00:00.000Z",
      limitations: [],
      pattern: {
        weekdayIndex: 3,
        sampleWeeks: 6,
        sampleQuality: "boa" as never,
        typicalVehicles: 18,
        typicalRevenue: 2400,
        typicalTicket: 133.3,
        typicalWashCount: 15,
        typicalParkingCount: 3,
        typicalAddOnRate: 0.4,
        topServices: [{ description: "Lavação Silver", averageCount: 6 }],
        cutoffTimeHM: null,
        limitations: [],
      },
    };

    const operational = redactToolResultForRole(result, "operacional") as typeof result;
    expect(operational.pattern?.typicalRevenue).toBeNull();
    expect(operational.pattern?.typicalTicket).toBeNull();
    expect(operational.pattern?.typicalVehicles).toBe(18);
  });

  it("crm_customers: zera totalSpent/averageTicket/lastCourtesy.amount por cliente, preserva status/veículo/serviços", () => {
    const result: ToolResult = {
      id: "crm_customers",
      source: "CRM",
      error: null,
      status: "ok",
      collectedAt: "2026-08-22T00:00:00.000Z",
      limitations: [],
      customers: [
        {
          customer: { id: "c1", name: "Fulano" } as never,
          profile: { customer: { id: "c1" } as never, firstVisitAt: null, daysAsCustomer: 10, visitCount: 3, vehicleCount: 1, lastVisitAt: null, daysSinceLastVisit: null, totalSpent: 540, averageTicket: 180, isRecurring: true, isVip: false },
          status: "ativo" as never,
          statusReason: "",
          primaryVehicle: null,
          lastServiceNames: ["Lavação Gold"],
          pendingRecommendationsCount: 0,
          lastCourtesy: { description: "Cortesia aniversário", grantedAt: "2026-08-01", amount: 50 },
        },
      ],
    };

    const operational = redactToolResultForRole(result, "operacional") as typeof result;
    const [entry] = operational.customers;
    expect(entry.profile.totalSpent).toBe(0);
    expect(entry.profile.averageTicket).toBeNull();
    expect(entry.lastCourtesy?.amount).toBe(0);
    expect(entry.status).toBe("ativo");
    expect(entry.lastServiceNames).toEqual(["Lavação Gold"]);
  });
});

describe("ZEZINHO_RESTRICTION_MESSAGE — nunca revela estrutura de permissão", () => {
  it("nunca menciona role/tabela/endpoint/query — só a frase natural de negócio", () => {
    expect(ZEZINHO_RESTRICTION_MESSAGE.toLowerCase()).not.toMatch(/\brole\b|\boperacional\b|tabela|endpoint|\bapi\b|\bquery\b|\bsql\b/);
  });
});
