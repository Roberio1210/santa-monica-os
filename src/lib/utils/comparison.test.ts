import { describe, expect, it } from "vitest";
import { comparisonToTrend } from "@/lib/utils/comparison";
import { comparePeriodValues } from "@/lib/utils/timezone";

describe("comparisonToTrend", () => {
  it("crescimento vira direction 'up' com o percentual absoluto arredondado", () => {
    const trend = comparisonToTrend(comparePeriodValues(150, 100));
    expect(trend.direction).toBe("up");
    expect(trend.value).toBe(50);
  });

  it("queda vira direction 'down', valor sempre positivo (a seta já indica o sinal)", () => {
    const trend = comparisonToTrend(comparePeriodValues(80, 100));
    expect(trend.direction).toBe("down");
    expect(trend.value).toBe(20);
  });

  it("variação desprezível (dentro de ±0.05%) vira 'flat'", () => {
    const trend = comparisonToTrend(comparePeriodValues(100.01, 100));
    expect(trend.direction).toBe("flat");
  });

  it("sem base no período anterior (percent null) nunca inventa um percentual", () => {
    const trend = comparisonToTrend(comparePeriodValues(50, 0));
    expect(trend.value).toBe(0);
    expect(trend.label).toContain("sem base");
  });
});
