import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import type { ToolResult } from "@/lib/zezinho/tools/types";

function meta(status: ToolResult["status"], limitations: string[] = []) {
  return { status, collectedAt: "2026-07-24T12:00:00.000Z", limitations };
}

describe("extractFacts — ferramentas da Z2 (clima, meta, padrão histórico) agora viram Fact (Sprint 4.0, Z3)", () => {
  it("weather_forecast ok com condição atual vira um Fact — nunca quando not_configured", () => {
    const ok: ToolResult = {
      id: "weather_forecast",
      source: "OpenWeatherMap",
      error: null,
      ...meta("ok"),
      forecast: { status: "ok", configured: true, error: null, source: "OpenWeatherMap", location: "Floripa", updatedAt: "2026-07-24T12:00:00.000Z", current: { temperature: 24, feelsLike: 25, condition: "céu limpo", precipitationProbability: null, windSpeedKmh: 10 }, nextHours: [], dailyForecast: [], limitations: [] },
    };
    expect(extractFacts([ok]).some((f) => f.key === "weather_current")).toBe(true);

    const notConfigured: ToolResult = { id: "weather_forecast", source: "OpenWeatherMap", error: "não configurado", ...meta("not_configured"), forecast: { status: "not_configured", configured: false, error: "não configurado", source: null, location: null, updatedAt: null, current: null, nextHours: [], dailyForecast: [], limitations: [] } };
    expect(extractFacts([notConfigured]).some((f) => f.key === "weather_current")).toBe(false);
  });

  it("goal_progress ok vira Fact com direção conforme o ritmo — nunca quando progress é null", () => {
    const behind: ToolResult = {
      id: "goal_progress",
      source: "Metas (Neon)",
      error: null,
      ...meta("ok"),
      progress: { goal: { id: "g1", area: "lavacao", label: "Lavação Julho", targetAmount: 30000, periodStart: "2026-07-01", periodEnd: "2026-07-31", bonusTiers: [] }, currentAmount: 5000, percentComplete: 16, remainingAmount: 25000, daysElapsed: 24, daysTotal: 31, projectedAmount: 15000, projectedPercent: 50, pace: "abaixo_do_ritmo", nextBonusTier: null, amountToNextBonus: null },
    };
    const facts = extractFacts([behind]);
    const fact = facts.find((f) => f.key === "goal_progress");
    expect(fact).toBeDefined();
    expect(fact?.direction).toBe("queda");

    const noGoal: ToolResult = { id: "goal_progress", source: "Metas (Neon)", error: "Nenhuma meta configurada.", ...meta("no_data"), progress: null };
    expect(extractFacts([noGoal])).toEqual([]);
  });

  it("historical_pattern ok com amostra vira Fact, rotulado proxy quando a amostra é insuficiente", () => {
    const insufficient: ToolResult = {
      id: "historical_pattern",
      source: "JumpPark — padrão histórico",
      error: null,
      ...meta("ok"),
      pattern: { weekdayIndex: 3, sampleWeeks: 2, sampleQuality: "insuficiente", typicalVehicles: 5, typicalRevenue: 500, typicalTicket: 100, typicalWashCount: 3, typicalParkingCount: 2, typicalAddOnRate: 0.2, topServices: [], cutoffTimeHM: null, limitations: [] },
    };
    const facts = extractFacts([insufficient]);
    const fact = facts.find((f) => f.key === "historical_pattern");
    expect(fact?.isProxy).toBe(true);

    const empty: ToolResult = { id: "historical_pattern", source: "JumpPark — padrão histórico", error: null, ...meta("no_data"), pattern: { weekdayIndex: 3, sampleWeeks: 0, sampleQuality: "insuficiente", typicalVehicles: null, typicalRevenue: null, typicalTicket: null, typicalWashCount: null, typicalParkingCount: null, typicalAddOnRate: null, topServices: [], cutoffTimeHM: null, limitations: [] } };
    expect(extractFacts([empty])).toEqual([]);
  });
});

describe("extractFacts — novas ferramentas da Z3 (situacional, contas a pagar/receber)", () => {
  it("situational_context sempre vira Fact — é síncrono e sempre 'ok'", () => {
    const result: ToolResult = {
      id: "situational_context",
      source: "Contexto situacional",
      error: null,
      ...meta("ok"),
      context: {
        nowIso: "2026-07-24",
        timeHM: "10:00",
        weekdayIndex: 5,
        weekdayLabel: "sexta-feira",
        areas: {
          lavacao: { area: "lavacao", isOpen: true, stage: "meio_expediente", minutesSinceOpen: 120, minutesUntilClose: 300, sampleConfidence: "parcial" },
          estacionamento: { area: "estacionamento", isOpen: true, stage: "meio_expediente", minutesSinceOpen: 120, minutesUntilClose: 600, sampleConfidence: "parcial" },
        },
      },
    };
    expect(extractFacts([result]).some((f) => f.key === "situational_context")).toBe(true);
  });

  it("accounts_payable ok com contas vencidas vira Fact com direção 'queda'", () => {
    const result: ToolResult = { id: "accounts_payable", source: "Neon — Contas a Pagar", error: null, ...meta("ok"), summary: { totalPending: 1000, totalOverdue: 500, totalPaidThisMonth: 200, upcoming7Count: 2, upcoming30Count: 5, count: 10 } };
    const fact = extractFacts([result]).find((f) => f.key === "accounts_payable");
    expect(fact?.direction).toBe("queda");
  });

  it("accounts_receivable ok sem atraso vira Fact com direção 'estavel'", () => {
    const result: ToolResult = {
      id: "accounts_receivable",
      source: "Neon — Contas a Receber",
      error: null,
      ...meta("ok"),
      dashboard: { receiveToday: 100, receiveTomorrow: 0, receiveThisWeek: 500, receiveThisMonth: 2000, overdueTotal: 0, delinquentClients: [], byCostCenter: [], byPaymentMethod: [], byCategory: [], upcomingDueDates: [] },
    };
    const fact = extractFacts([result]).find((f) => f.key === "accounts_receivable");
    expect(fact?.direction).toBe("estavel");
  });
});
