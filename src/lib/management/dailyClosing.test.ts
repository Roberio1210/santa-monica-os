import { describe, expect, it } from "vitest";
import { deriveClosingInsights } from "@/lib/management/dailyClosing";
import type { ComparisonReport } from "@/lib/zezinho/comparison-engine";

/**
 * Missão Z4 — `deriveClosingInsights` é pura (nunca I/O): opera só sobre um `ComparisonReport` já
 * calculado por `buildComparisonReport` (o mesmo motor real de `full_period_comparison`,
 * confirmado como a fonte da resposta real auditada na Z3.4). Nunca um segundo pipeline de
 * cálculo — só tradução dos números já reais em achados/recomendações.
 */

function metric(key: string, a: number, b: number | null, deltaPercent: number | null, trend: "aumento" | "queda" | "estavel" | "indisponivel"): ComparisonReport["metrics"][number] {
  return { key, label: key, unit: "count", a, b, comparison: { current: a, previous: b, deltaPercent, trend }, source: "teste" };
}

function report(overrides: Partial<ComparisonReport> = {}): ComparisonReport {
  return {
    periodA: { key: "today", from: "2026-08-23", to: "2026-08-23", label: "Hoje" },
    periodB: { key: "yesterday", from: "2026-08-22", to: "2026-08-22", label: "Ontem" },
    filterKind: null,
    jumpparkConfigured: true,
    metrics: [],
    packageCountsA: { Bronze: 0, Silver: 0, Gold: 0 },
    packageCountsB: { Bronze: 0, Silver: 0, Gold: 0 },
    topServicesA: [],
    topServicesB: [],
    washCategoryGroupsA: [],
    washCategoryGroupsB: [],
    peakHourA: null,
    peakHourB: null,
    errors: [],
    ...overrides,
  };
}

describe("deriveClosingInsights — dia sem movimento", () => {
  it("JumpPark não configurado -> nenhum insight, nunca lança", () => {
    expect(deriveClosingInsights(report({ jumpparkConfigured: false }), "admin")).toEqual([]);
  });

  it("dia zerado (todas as métricas em 0) -> nenhum insight inventado", () => {
    const r = report({ metrics: [metric("revenue", 0, 0, 0, "estavel"), metric("orders", 0, 0, 0, "estavel"), metric("avgTicket", 0, 0, 0, "estavel")] });
    expect(deriveClosingInsights(r, "admin")).toEqual([]);
  });
});

describe("deriveClosingInsights — dia normal", () => {
  it("faturamento 30% acima do período anterior (admin) -> insight de alta, nunca para operacional", () => {
    const r = report({ metrics: [metric("revenue", 1300, 1000, 30, "aumento")] });
    const adminInsights = deriveClosingInsights(r, "admin");
    expect(adminInsights.some((i) => i.id === "revenue-trend" && i.severity === "info")).toBe(true);
    expect(deriveClosingInsights(r, "operacional").some((i) => i.id === "revenue-trend")).toBe(false);
  });

  it("ticket médio caiu -> insight de atenção (warning), com evidência rastreável aos dois valores reais", () => {
    const r = report({ metrics: [metric("avgTicket", 90, 120, -25, "queda")] });
    const insights = deriveClosingInsights(r, "admin");
    const found = insights.find((i) => i.id === "ticket-drop");
    expect(found?.severity).toBe("warning");
    expect(found?.evidence).toContain("90");
    expect(found?.evidence).toContain("120");
  });

  it("volume de ordens caiu mais de 20% -> insight de atenção", () => {
    const r = report({ metrics: [metric("orders", 5, 10, -50, "queda")] });
    expect(deriveClosingInsights(r, "admin").some((i) => i.id === "orders-drop")).toBe(true);
  });
});

describe("deriveClosingInsights — mix de pacotes (lavação x estacionamento não se confunde com pacote)", () => {
  it("mix concentrado em Bronze (>=60%, >=3 pacotes) -> sinaliza oportunidade de upgrade", () => {
    const r = report({ metrics: [metric("washCount", 10, null, null, "indisponivel")], packageCountsA: { Bronze: 4, Silver: 1, Gold: 0 } });
    expect(deriveClosingInsights(r, "admin").some((i) => i.id === "mix-bronze-heavy")).toBe(true);
  });

  it("boa participação de Gold (>=40%, >=3 pacotes) -> sinaliza positivamente", () => {
    const r = report({ metrics: [metric("washCount", 10, null, null, "indisponivel")], packageCountsA: { Bronze: 1, Silver: 1, Gold: 2 } });
    expect(deriveClosingInsights(r, "admin").some((i) => i.id === "mix-gold-strong")).toBe(true);
  });

  it("poucos pacotes vendidos (< 3) -> nunca insight de mix, amostra pequena demais para conclusão", () => {
    const r = report({ metrics: [metric("washCount", 2, null, null, "indisponivel")], packageCountsA: { Bronze: 2, Silver: 0, Gold: 0 } });
    expect(deriveClosingInsights(r, "admin").some((i) => i.id.startsWith("mix-"))).toBe(false);
  });
});

describe("Missão Z5 — poucos adicionais e cruzamento volume x ticket", () => {
  it("bom volume de lavações e zero adicionais -> sinaliza poucos adicionais vendidos", () => {
    const r = report({ metrics: [metric("washCount", 8, null, null, "indisponivel")] });
    expect(deriveClosingInsights(r, "admin", 0).some((i) => i.id === "few-addons")).toBe(true);
  });

  it("volume baixo de lavações (< 5) -> nunca sinaliza poucos adicionais, amostra pequena demais", () => {
    const r = report({ metrics: [metric("washCount", 3, null, null, "indisponivel")] });
    expect(deriveClosingInsights(r, "admin", 0).some((i) => i.id === "few-addons")).toBe(false);
  });

  it("há adicionais vendidos -> nunca sinaliza 'poucos adicionais'", () => {
    const r = report({ metrics: [metric("washCount", 8, null, null, "indisponivel")] });
    expect(deriveClosingInsights(r, "admin", 4).some((i) => i.id === "few-addons")).toBe(false);
  });

  it("bom volume de veículos (não caiu) + ticket em queda -> 'bom volume mas ticket baixo' (só admin)", () => {
    const r = report({ metrics: [metric("vehicles", 20, 18, 11, "aumento"), metric("avgTicket", 90, 120, -25, "queda")] });
    expect(deriveClosingInsights(r, "admin").some((i) => i.id === "high-volume-low-ticket")).toBe(true);
    expect(deriveClosingInsights(r, "operacional").some((i) => i.id === "high-volume-low-ticket")).toBe(false);
  });

  it("poucos veículos (caiu) + ticket em alta -> 'poucos carros mas ticket alto'", () => {
    const r = report({ metrics: [metric("vehicles", 5, 12, -58, "queda"), metric("avgTicket", 200, 100, 100, "aumento")] });
    expect(deriveClosingInsights(r, "admin").some((i) => i.id === "low-volume-high-ticket")).toBe(true);
  });

  it("veículos e ticket seguindo a mesma direção -> nunca dispara os dois insights cruzados de uma vez", () => {
    const r = report({ metrics: [metric("vehicles", 20, 18, 11, "aumento"), metric("avgTicket", 130, 120, 8, "aumento")] });
    const insights = deriveClosingInsights(r, "admin");
    expect(insights.some((i) => i.id === "high-volume-low-ticket")).toBe(false);
    expect(insights.some((i) => i.id === "low-volume-high-ticket")).toBe(false);
  });
});
