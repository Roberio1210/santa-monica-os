import { describe, expect, it } from "vitest";
import { resolvePeriods } from "@/lib/zezinho/planner/periods";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";

function entities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null, ...overrides };
}

const PERIOD_A = { key: "week" as const, from: "2026-07-13", to: "2026-07-19", label: "Semana atual" };
const PERIOD_B = { key: "custom" as const, from: "2026-07-06", to: "2026-07-12", label: "semana passada" };
const SESSION_WITH_PERIODS: ReasoningSession = { ...EMPTY_REASONING_SESSION, activePeriodA: PERIOD_A, activePeriodB: PERIOD_B };

describe("resolvePeriods — entidade nova > memória > nenhum (nunca inventa período padrão)", () => {
  it("entidade de comparação nova tem prioridade sobre a memória", () => {
    const newComparison = { periodA: { key: "custom" as const, from: "2026-07-01", to: "2026-07-19", label: "julho" }, periodB: { key: "custom" as const, from: "2026-06-01", to: "2026-06-19", label: "junho" }, dayMatched: true, note: null };
    const result = resolvePeriods(entities({ comparison: newComparison }), SESSION_WITH_PERIODS);
    expect(result?.periodA).toEqual(newComparison.periodA);
    expect(result?.periodB).toEqual(newComparison.periodB);
  });

  it("sem entidade nova, reaproveita o período ativo da memória", () => {
    const result = resolvePeriods(entities(), SESSION_WITH_PERIODS);
    expect(result?.periodA).toEqual(PERIOD_A);
    expect(result?.periodB).toEqual(PERIOD_B);
  });

  it("período único (singlePeriod) nunca traz periodB", () => {
    const result = resolvePeriods(entities({ singlePeriod: { key: "today", from: "2026-07-24", to: "2026-07-24", label: "Hoje" } }), EMPTY_REASONING_SESSION);
    expect(result?.periodA.key).toBe("today");
    expect(result?.periodB).toBeNull();
  });

  it("sem entidade e sem memória, devolve null — nunca inventa um período padrão", () => {
    expect(resolvePeriods(entities(), EMPTY_REASONING_SESSION)).toBeNull();
  });
});
