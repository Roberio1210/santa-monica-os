import { describe, expect, it } from "vitest";
import { computeContextQuality } from "@/lib/zezinho/planner/contextQuality";
import type { OperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import type { ToolResult } from "@/lib/zezinho/tools/types";

function meta(status: ToolResult["status"], limitations: string[] = []) {
  return { status, collectedAt: "2026-07-24T12:00:00.000Z", limitations };
}

function context(toolResults: ToolResult[]): OperationalContext {
  return { capabilities: [], byCapability: {}, toolCalls: [], toolResults, toolTrace: [] as never[], periodResolved: true };
}

describe("computeContextQuality — regras explicáveis, nunca uma média arbitrária (seção 7)", () => {
  it("todas as fontes ok -> overallLevel 'high', com drivers explícitos", () => {
    const quality = computeContextQuality(
      context([
        { id: "jumppark_period_summary", source: "JumpPark", error: null, ...meta("ok"), jumpparkConfigured: true, metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] },
        { id: "cash_ledger_totals", source: "Neon — fluxo de caixa", error: null, ...meta("ok"), metrics: [] },
      ]),
    );
    expect(quality.overallLevel).toBe("high");
    expect(quality.availableSources).toEqual(["JumpPark", "Neon — fluxo de caixa"]);
    expect(quality.confidenceDrivers.length).toBeGreaterThan(0);
  });

  it("nenhuma fonte disponível -> overallLevel 'low'", () => {
    const quality = computeContextQuality(
      context([{ id: "jumppark_period_summary", source: "JumpPark", error: "JumpPark não configurado.", ...meta("not_configured"), jumpparkConfigured: false, metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] }]),
    );
    expect(quality.overallLevel).toBe("low");
    expect(quality.missingSources).toEqual(["JumpPark"]);
  });

  it("falha temporária em uma fonte nunca vira 'high' mesmo com as demais ok", () => {
    const quality = computeContextQuality(
      context([
        { id: "jumppark_period_summary", source: "JumpPark", error: null, ...meta("ok"), jumpparkConfigured: true, metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] },
        { id: "cash_ledger_totals", source: "Neon — fluxo de caixa", error: "falha", ...meta("temporary_failure"), metrics: [] },
      ]),
    );
    expect(quality.overallLevel).not.toBe("high");
    expect(quality.failedSources).toContain("Neon — fluxo de caixa");
  });

  it("amostra histórica insuficiente reduz a confiança e aparece como razão explícita", () => {
    const quality = computeContextQuality(
      context([
        {
          id: "historical_pattern",
          source: "JumpPark — padrão histórico",
          error: null,
          ...meta("ok"),
          pattern: { weekdayIndex: 3, sampleWeeks: 2, sampleQuality: "insuficiente", typicalVehicles: 5, typicalRevenue: 100, typicalTicket: 20, typicalWashCount: 3, typicalParkingCount: 2, typicalAddOnRate: 0.1, topServices: [], cutoffTimeHM: null, limitations: [] },
        },
      ]),
    );
    expect(quality.overallLevel).toBe("medium");
    expect(quality.confidenceReducers.some((r) => r.includes("amostra histórica insuficiente"))).toBe(true);
    expect(quality.sampleQuality).toBe("insuficiente");
  });

  it("sem nenhum resultado (nenhuma capacidade pedida) -> overallLevel 'low', nunca lança", () => {
    expect(computeContextQuality(context([])).overallLevel).toBe("low");
  });
});
