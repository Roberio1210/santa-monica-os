import { describe, expect, it } from "vitest";
import { selectTools } from "@/lib/zezinho/planner/selectTools";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { ToolId } from "@/lib/zezinho/tools/types";

function entities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null, ...overrides };
}

const PERIOD_A = { key: "week" as const, from: "2026-07-13", to: "2026-07-19", label: "Semana atual" };
const PERIOD_B = { key: "custom" as const, from: "2026-07-06", to: "2026-07-12", label: "semana passada" };
const SESSION_WITH_PERIODS: ReasoningSession = { ...EMPTY_REASONING_SESSION, activePeriodA: PERIOD_A, activePeriodB: PERIOD_B };

function toolIds(calls: { id: ToolId }[]): ToolId[] {
  return calls.map((c) => c.id);
}

describe("selectTools — inform/clarify_needed não usam o pipeline novo", () => {
  it("inform não busca nenhuma ferramenta (roteador determinístico existente cuida disso)", () => {
    const result = selectTools("inform", null, entities(), SESSION_WITH_PERIODS);
    expect(result.toolCalls).toEqual([]);
  });

  it("clarify_needed não busca nenhuma ferramenta", () => {
    const result = selectTools("clarify_needed", null, entities(), SESSION_WITH_PERIODS);
    expect(result.toolCalls).toEqual([]);
  });
});

describe("selectTools — compare usa a comparação completa (é literalmente o que foi pedido)", () => {
  it("com período resolvível, chama exatamente full_period_comparison", () => {
    const result = selectTools("compare", "business_health", entities({ comparison: { periodA: PERIOD_A, periodB: PERIOD_B, dayMatched: true, note: null } }), EMPTY_REASONING_SESSION);
    expect(toolIds(result.toolCalls)).toEqual(["full_period_comparison"]);
    expect(result.periodResolved).toBe(true);
  });

  it("sem nenhum período resolvível, não busca nada (honesto, nunca inventa período padrão)", () => {
    const result = selectTools("compare", "business_health", entities(), EMPTY_REASONING_SESSION);
    expect(result.toolCalls).toEqual([]);
    expect(result.periodResolved).toBe(false);
  });
});

describe("selectTools — busca seletiva por objetivo (nunca 'tudo por garantia')", () => {
  it("increase_ticket busca só o resumo operacional", () => {
    const result = selectTools("evaluate_decision", "increase_ticket", entities(), SESSION_WITH_PERIODS);
    expect(toolIds(result.toolCalls)).toEqual(["jumppark_period_summary"]);
  });

  it("improve_service_mix busca resumo operacional + pacotes, nada de caixa/DRE/CRM", () => {
    const result = selectTools("evaluate_decision", "improve_service_mix", entities({ packageMentioned: "Silver" }), SESSION_WITH_PERIODS);
    const ids = toolIds(result.toolCalls);
    expect(ids).toEqual(["jumppark_period_summary", "jumppark_wash_packages"]);
    expect(ids).not.toContain("cash_ledger_totals");
    expect(ids).not.toContain("dre_result");
    expect(ids).not.toContain("crm_customers");
  });

  it("client_retention busca só CRM — nunca JumpPark, caixa ou DRE", () => {
    const result = selectTools("recommend", "client_retention", entities({ topic: "clientes" }), EMPTY_REASONING_SESSION);
    expect(toolIds(result.toolCalls)).toEqual(["crm_customers"]);
  });

  it("client_retention funciona mesmo sem nenhum período em contexto (CRM não depende de período)", () => {
    const result = selectTools("recommend", "client_retention", entities({ topic: "clientes" }), EMPTY_REASONING_SESSION);
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].periodA).toBeNull();
  });

  it("reduce_costs busca só caixa", () => {
    const result = selectTools("evaluate_decision", "reduce_costs", entities(), SESSION_WITH_PERIODS);
    expect(toolIds(result.toolCalls)).toEqual(["cash_ledger_totals"]);
  });

  it("improve_cash_flow busca caixa + resumo operacional (para comparar operacional vs. caixa)", () => {
    const result = selectTools("diagnose", "improve_cash_flow", entities({ topic: "caixa" }), SESSION_WITH_PERIODS);
    expect(toolIds(result.toolCalls)).toEqual(["cash_ledger_totals", "jumppark_period_summary"]);
  });

  it("staffing_capacity usa só o resumo operacional como proxy — sem período, não busca nada (nunca inventa proxy sem base)", () => {
    const withPeriod = selectTools("evaluate_decision", "staffing_capacity", entities({ topic: "equipe" }), SESSION_WITH_PERIODS);
    expect(toolIds(withPeriod.toolCalls)).toEqual(["jumppark_period_summary"]);

    const withoutPeriod = selectTools("evaluate_decision", "staffing_capacity", entities({ topic: "equipe" }), EMPTY_REASONING_SESSION);
    expect(withoutPeriod.toolCalls).toEqual([]);
  });

  it("business_health (único objetivo genuinamente amplo) busca resumo + caixa + alertas", () => {
    const result = selectTools("diagnose", "business_health", entities(), SESSION_WITH_PERIODS);
    expect(toolIds(result.toolCalls)).toEqual(["jumppark_period_summary", "cash_ledger_totals", "central_alerts"]);
  });
});

describe("selectTools — resolução de período (entidade nova > memória > nenhum)", () => {
  it("entidade de comparação nova tem prioridade sobre a memória", () => {
    const newComparison = { periodA: { key: "custom" as const, from: "2026-07-01", to: "2026-07-19", label: "julho" }, periodB: { key: "custom" as const, from: "2026-06-01", to: "2026-06-19", label: "junho" }, dayMatched: true, note: null };
    const result = selectTools("evaluate_decision", "increase_ticket", entities({ comparison: newComparison }), SESSION_WITH_PERIODS);
    expect(result.toolCalls[0].periodA).toEqual(newComparison.periodA);
  });

  it("sem entidade nova, reaproveita o período ativo da memória", () => {
    const result = selectTools("evaluate_decision", "increase_ticket", entities(), SESSION_WITH_PERIODS);
    expect(result.toolCalls[0].periodA).toEqual(PERIOD_A);
    expect(result.toolCalls[0].periodB).toEqual(PERIOD_B);
  });

  it("sem entidade e sem memória, ferramentas que dependem de período não são chamadas", () => {
    const result = selectTools("evaluate_decision", "increase_ticket", entities(), EMPTY_REASONING_SESSION);
    expect(result.toolCalls).toEqual([]);
    expect(result.periodResolved).toBe(false);
  });
});

describe("selectTools — propaga o filtro de área para as ferramentas", () => {
  it("filtro 'lavacao' chega em cada ToolCall gerada", () => {
    const result = selectTools("evaluate_decision", "improve_service_mix", entities({ areaFilter: "lavacao" }), SESSION_WITH_PERIODS);
    for (const call of result.toolCalls) {
      expect(call.filterKind).toBe("lavacao");
    }
  });
});
