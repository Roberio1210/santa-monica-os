import { describe, expect, it } from "vitest";
import { averageIntervalDays, computeFrequencyTrend, hasStoppedComing, topServiceCombinations } from "@/lib/integrations/jumppark/vehicleAnalytics";

describe("averageIntervalDays", () => {
  it("menos de 2 datas distintas -> null", () => {
    expect(averageIntervalDays([])).toBeNull();
    expect(averageIntervalDays(["2026-07-01"])).toBeNull();
    expect(averageIntervalDays(["2026-07-01", "2026-07-01"])).toBeNull();
  });

  it("2 datas -> intervalo é a diferença entre elas", () => {
    expect(averageIntervalDays(["2026-07-01", "2026-07-11"])).toBe(10);
  });

  it("múltiplas datas -> média dos intervalos consecutivos", () => {
    // 07-01 -> 07-11 (10 dias), 07-11 -> 07-21 (10 dias) => média 10
    expect(averageIntervalDays(["2026-07-01", "2026-07-11", "2026-07-21"])).toBe(10);
  });

  it("ignora duplicatas (duas ordens no mesmo dia contam como 1 visita)", () => {
    expect(averageIntervalDays(["2026-07-01", "2026-07-01", "2026-07-11"])).toBe(10);
  });

  it("funciona com datas fora de ordem (ordena internamente)", () => {
    expect(averageIntervalDays(["2026-07-21", "2026-07-01", "2026-07-11"])).toBe(10);
  });
});

describe("computeFrequencyTrend", () => {
  it("menos de 3 visitas distintas -> indefinido", () => {
    expect(computeFrequencyTrend([]).direction).toBe("indefinido");
    expect(computeFrequencyTrend(["2026-07-01"]).direction).toBe("indefinido");
  });

  it("exatamente 2 visitas -> indefinido, mas ainda reporta o gap recente", () => {
    const trend = computeFrequencyTrend(["2026-07-01", "2026-07-11"]);
    expect(trend.direction).toBe("indefinido");
    expect(trend.recentGapDays).toBe(10);
    expect(trend.historicalAverageDays).toBeNull();
  });

  it("gap recente bem menor que a média histórica -> aumentando", () => {
    // histórico: 07-01 -> 08-01 (31 dias) -> 09-01 (31 dias), média histórica ~31
    // gap recente: 09-01 -> 09-05 (4 dias) — MUITO mais rápido que o habitual
    const trend = computeFrequencyTrend(["2026-07-01", "2026-08-01", "2026-09-01", "2026-09-05"]);
    expect(trend.direction).toBe("aumentando");
  });

  it("gap recente bem maior que a média histórica -> caindo", () => {
    const trend = computeFrequencyTrend(["2026-01-01", "2026-01-15", "2026-01-29", "2026-04-01"]);
    expect(trend.direction).toBe("caindo");
  });

  it("gap recente parecido com a média histórica -> estável", () => {
    const trend = computeFrequencyTrend(["2026-01-01", "2026-01-15", "2026-01-29", "2026-02-12"]);
    expect(trend.direction).toBe("estavel");
  });
});

describe("hasStoppedComing", () => {
  it("veículo com poucas visitas nunca é considerado 'deixou de vir' (sem base histórica)", () => {
    expect(hasStoppedComing(["2026-01-01", "2026-02-01"], 300)).toBe(false);
  });

  it("dias sem retorno muito acima do intervalo médio próprio -> true", () => {
    // intervalo médio histórico: ~15 dias (3 visitas mensais quinzenais)
    const dates = ["2026-01-01", "2026-01-15", "2026-01-29"];
    expect(hasStoppedComing(dates, 60)).toBe(true); // 60 dias > 2x15
  });

  it("dias sem retorno dentro do esperado pelo próprio padrão -> false", () => {
    const dates = ["2026-01-01", "2026-01-15", "2026-01-29"];
    expect(hasStoppedComing(dates, 20)).toBe(false); // 20 dias < 2x15
  });

  it("daysSinceLastVisit null (nunca visitou) -> false, nunca lança", () => {
    expect(hasStoppedComing(["2026-01-01", "2026-01-15", "2026-01-29"], null)).toBe(false);
  });
});

describe("topServiceCombinations", () => {
  it("conta pares de categorias que aparecem juntos na mesma ordem", () => {
    const byOrder = [
      ["Lavação Gold", "Higienização"],
      ["Lavação Gold", "Higienização"],
      ["Lavação Gold", "Polimento"],
    ];
    const combos = topServiceCombinations(byOrder);
    expect(combos[0]).toEqual({ categories: ["Higienização", "Lavação Gold"], count: 2 });
  });

  it("ordem com só 1 categoria não gera par nenhum", () => {
    expect(topServiceCombinations([["Lavação Gold"]])).toEqual([]);
  });

  it("categoria duplicada na mesma ordem não conta como par consigo mesma", () => {
    expect(topServiceCombinations([["Lavação Gold", "Lavação Gold"]])).toEqual([]);
  });

  it("respeita o limite informado", () => {
    const byOrder = [
      ["A", "B"],
      ["A", "C"],
      ["A", "D"],
    ];
    expect(topServiceCombinations(byOrder, 2)).toHaveLength(2);
  });
});
