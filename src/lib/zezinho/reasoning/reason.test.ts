import { describe, expect, it } from "vitest";
import { reason } from "@/lib/zezinho/reasoning/reason";
import { comparePeriods } from "@/lib/integrations/jumppark/operations-summary";
import type { ReasoningInput } from "@/lib/zezinho/reasoning/types";
import type { ToolResult } from "@/lib/zezinho/tools/types";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { ComparisonMetric } from "@/lib/zezinho/comparison-engine";
import type { CrmCustomer } from "@/lib/crm/types";

function m(key: string, label: string, unit: "currency" | "count", a: number, b: number | null): ComparisonMetric {
  return { key, label, unit, a, b, comparison: comparePeriods(a, b), source: "JumpPark" };
}

function entities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null, ...overrides };
}

function baseInput(overrides: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    intent: "diagnose",
    objective: "business_health",
    entities: entities(),
    memory: { activePeriodA: null, activePeriodB: null, activeAreaFilter: null, activeObjective: null, lastInsightSummaries: [], explainedMetricKeys: [], usedNarrationOpeners: [] },
    toolCalls: [],
    toolResults: [],
    toolTrace: [],
    ...overrides,
  };
}

function customer(overrides: Partial<CrmCustomer> = {}): CrmCustomer {
  return {
    id: "c1",
    name: "Maria Silva",
    phoneMasked: "11 9****-1234",
    hasPhone: true,
    whatsappUrl: null,
    status: "em_risco",
    statusReason: "Sem retorno há 45 dias",
    firstVisit: "2026-01-01",
    lastVisit: "2026-06-01",
    daysSinceLastVisit: 45,
    visitCount: 5,
    totalSpent: 500,
    averageTicket: 100,
    averageIntervalDays: 20,
    topServices: [],
    vehicles: [],
    timeline: [],
    financial: { matched: false, items: [], totalOpen: 0, totalOverdue: 0, totalReceived: 0 },
    opportunities: [],
    recommendations: [],
    ...overrides,
  };
}

describe("reason — fatos, achados e diagnóstico a partir de resultados reais das ferramentas", () => {
  it("faturamento subiu por volume, não por ticket -> achado + diagnóstico correspondente", () => {
    const toolResults: ToolResult[] = [
      {
        id: "jumppark_period_summary",
        source: "JumpPark",
        error: null,
        jumpparkConfigured: true,
        metrics: [m("revenue", "Faturamento operacional", "currency", 12000, 10000), m("washCount", "Lavações", "count", 130, 100), m("avgTicket", "Ticket médio", "currency", 92, 100)],
        peakHourA: null,
        peakHourB: null,
        topServicesA: [],
      },
    ];
    const result = reason(baseInput({ toolResults }), "como foi a semana");
    expect(result.facts.length).toBe(3);
    expect(result.findings.some((f) => f.key === "revenue_from_volume")).toBe(true);
    expect(result.diagnosis?.mainHypothesis?.statement).toMatch(/volume/i);
    expect(result.confidence).toBe("alta");
  });

  it("propaga erro de fonte como lacuna, sem derrubar o raciocínio", () => {
    const toolResults: ToolResult[] = [{ id: "cash_ledger_totals", source: "Neon — fluxo de caixa", error: "Não foi possível consultar o Fluxo de Caixa (Neon).", metrics: [] }];
    const result = reason(baseInput({ toolResults }), "como esta o caixa");
    expect(result.gaps.some((g) => g.description.includes("Fluxo de Caixa"))).toBe(true);
    expect(result.facts).toEqual([]);
  });
});

describe("reason — client_retention usa dados reais do CRM, nunca inventa cliente", () => {
  it("recomenda ligar para clientes reais em risco, com motivo e evidência", () => {
    const toolResults: ToolResult[] = [{ id: "crm_customers", source: "CRM (JumpPark + Contas a Receber)", error: null, jumpparkConfigured: true, customers: [customer(), customer({ id: "c2", name: "João Pereira", daysSinceLastVisit: 60, statusReason: "Sem retorno há 60 dias" })] }];
    const result = reason(baseInput({ intent: "recommend", objective: "client_retention", toolResults }), "quem devemos ligar hoje");
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].action).toMatch(/Maria Silva|João Pereira/);
    expect(result.recommendations[0].evidenceFactKeys.length).toBeGreaterThan(0);
  });

  it("sem cliente em risco, admite honestamente — nunca inventa um nome", () => {
    const toolResults: ToolResult[] = [{ id: "crm_customers", source: "CRM (JumpPark + Contas a Receber)", error: null, jumpparkConfigured: true, customers: [customer({ status: "ativo" })] }];
    const result = reason(baseInput({ intent: "recommend", objective: "client_retention", toolResults }), "quem devemos ligar hoje");
    expect(result.recommendations[0].action).toMatch(/Nenhuma/i);
  });
});

describe("reason — staffing_capacity sempre rotula proxy, nunca afirma produtividade real", () => {
  it("confiança nunca alta quando o objetivo é proxy_only", () => {
    const toolResults: ToolResult[] = [
      { id: "jumppark_period_summary", source: "JumpPark", error: null, jumpparkConfigured: true, metrics: [m("vehicles", "Veículos atendidos", "count", 82, 60), m("avgTicket", "Ticket médio", "currency", 90, 110)], peakHourA: null, peakHourB: null, topServicesA: [] },
    ];
    const result = reason(baseInput({ intent: "evaluate_decision", objective: "staffing_capacity", toolResults }), "vale contratar mais alguem");
    expect(result.confidence).not.toBe("alta");
    expect(result.gaps.some((g) => g.description.toLowerCase().includes("proxy"))).toBe(true);
    expect(result.recommendations[0].reason).toMatch(/Não tenho produtividade individual/);
  });
});

describe("reason — reduce_costs/estoque usa o alerta real de receitas sem calibração (bug fix)", () => {
  it("recomenda calibrar receitas quando o alerta 'sem receita' está presente — nunca a genérica de acompanhar itens quase vazios", () => {
    const toolResults: ToolResult[] = [
      { id: "inventory_overview", source: "Estoque", error: null, summary: { totalItems: 65, lowStockCount: 0, nearEmptyCount: 1, sealedCount: 24, totalStockValue: null, itemsWithoutMinimum: 65 } },
      { id: "central_alerts", source: "Central de Operações", error: null, alerts: [{ severity: "atencao", title: "Serviços sem receita", description: "17 serviço(s) sem nenhuma receita cadastrada.", date: null, module: "Estoque", href: "/estoque/pendencias" }] },
    ];
    const result = reason(baseInput({ intent: "diagnose", objective: "reduce_costs", entities: entities({ topic: "estoque" }), toolResults }), "estamos desperdicando produto");
    expect(result.recommendations[0].action).toMatch(/[Cc]alibrar as receitas/);
    expect(result.recommendations[0].evidenceFactKeys.length).toBeGreaterThan(0);
  });
});

describe("reason — improve_service_mix respeita a escolha do cliente quando o pacote é mencionado", () => {
  it("pacote Bronze mencionado -> recomendação consultiva, não pressão de upgrade", () => {
    const result = reason(baseInput({ intent: "recommend", objective: "improve_service_mix", entities: entities({ packageMentioned: "Bronze" }) }), "e se o cliente quiser somente a bronze");
    expect(result.recommendations[0].action).toMatch(/[Rr]espeitar/);
  });
});

describe("reason — links reaproveitam buildLinks/buildSources quando a ferramenta é a comparação completa", () => {
  it("compare usa os mesmos links já testados do Sprint 2.0", () => {
    const toolResults: ToolResult[] = [
      {
        id: "full_period_comparison",
        source: "JumpPark + Neon (fluxo de caixa + DRE)",
        error: null,
        report: {
          periodA: { key: "week", from: "2026-07-13", to: "2026-07-19", label: "Semana atual" },
          periodB: { key: "custom", from: "2026-07-06", to: "2026-07-12", label: "semana passada" },
          filterKind: null,
          jumpparkConfigured: true,
          metrics: [m("revenue", "Faturamento operacional", "currency", 12000, 10000)],
          packageCountsA: { Bronze: 0, Silver: 0, Gold: 0 },
          packageCountsB: { Bronze: 0, Silver: 0, Gold: 0 },
          topServicesA: [],
          topServicesB: [],
          peakHourA: null,
          peakHourB: null,
          errors: [],
        },
      },
    ];
    const result = reason(baseInput({ intent: "compare", toolResults }), "como foi nossa semana");
    expect(result.links.some((l) => l.label.includes("Semana atual"))).toBe(true);
    expect(result.sources.some((s) => s.includes("JumpPark"))).toBe(true);
  });
});
