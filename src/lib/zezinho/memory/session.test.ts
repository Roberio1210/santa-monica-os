import { describe, expect, it } from "vitest";
import { withActiveAnalysis, withExplainedMetric, withInsightSummary, withUsedOpener, wasMetricExplained } from "@/lib/zezinho/memory/session";
import { EMPTY_REASONING_SESSION, hasActiveAnalysis } from "@/lib/zezinho/memory/types";

describe("withActiveAnalysis", () => {
  it("atualiza período/filtro/objetivo sem mutar a sessão original", () => {
    const periodA = { key: "week" as const, from: "2026-07-13", to: "2026-07-19", label: "Semana atual" };
    const next = withActiveAnalysis(EMPTY_REASONING_SESSION, { periodA, periodB: null, objective: "business_health" });
    expect(next.activePeriodA).toEqual(periodA);
    expect(next.activeObjective).toBe("business_health");
    expect(EMPTY_REASONING_SESSION.activePeriodA).toBeNull();
    expect(hasActiveAnalysis(next)).toBe(true);
  });
});

describe("withInsightSummary / withExplainedMetric / withUsedOpener — dedupe", () => {
  it("não duplica o mesmo resumo de achado", () => {
    let session = withInsightSummary(EMPTY_REASONING_SESSION, "ticket em queda");
    session = withInsightSummary(session, "ticket em queda");
    expect(session.lastInsightSummaries).toEqual(["ticket em queda"]);
  });

  it("não duplica a mesma métrica explicada, e wasMetricExplained reflete isso", () => {
    let session = withExplainedMetric(EMPTY_REASONING_SESSION, "avgTicket");
    expect(wasMetricExplained(session, "avgTicket")).toBe(true);
    expect(wasMetricExplained(session, "revenue")).toBe(false);
    session = withExplainedMetric(session, "avgTicket");
    expect(session.explainedMetricKeys).toEqual(["avgTicket"]);
  });

  it("não duplica a mesma abertura de narração usada", () => {
    let session = withUsedOpener(EMPTY_REASONING_SESSION, "Se eu estivesse gerenciando amanhã...");
    session = withUsedOpener(session, "Se eu estivesse gerenciando amanhã...");
    expect(session.usedNarrationOpeners).toEqual(["Se eu estivesse gerenciando amanhã..."]);
  });
});
