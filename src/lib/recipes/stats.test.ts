import { describe, expect, it } from "vitest";
import { computeMedian, computeRecipeStats } from "@/lib/recipes/stats";
import type { CalibrationSample } from "@/lib/recipes/types";

function sample(overrides: Partial<CalibrationSample> = {}): CalibrationSample {
  return {
    id: "s1",
    recipeId: "r1",
    serviceOrderExternalId: null,
    date: "2026-07-10",
    quantityBefore: 100,
    quantityAfter: 90,
    preparedQuantity: null,
    leftoverReused: null,
    discarded: null,
    dilutionRatio: null,
    concentrateConsumed: 10,
    responsibleName: null,
    status: "valida",
    exclusionReason: null,
    notes: null,
    ...overrides,
  };
}

describe("computeMedian", () => {
  it("número ímpar de valores: retorna o valor central", () => {
    expect(computeMedian([10, 20, 30])).toBe(20);
  });

  it("número par de valores: retorna a média dos dois centrais", () => {
    expect(computeMedian([10, 20, 30, 40])).toBe(25);
  });
});

describe("computeRecipeStats", () => {
  it("sem amostras: tudo null e contagem zero", () => {
    expect(computeRecipeStats([])).toEqual({ median: null, min: null, max: null, validSampleCount: 0 });
  });

  it("calcula mediana, mínimo e máximo só das amostras válidas", () => {
    const samples = [
      sample({ id: "1", concentrateConsumed: 10 }),
      sample({ id: "2", concentrateConsumed: 12 }),
      sample({ id: "3", concentrateConsumed: 8 }),
      sample({ id: "4", concentrateConsumed: 14 }),
      sample({ id: "5", concentrateConsumed: 11 }),
    ];
    const stats = computeRecipeStats(samples);
    expect(stats.validSampleCount).toBe(5);
    expect(stats.min).toBe(8);
    expect(stats.max).toBe(14);
    expect(stats.median).toBe(11);
  });

  it("amostra excluída nunca entra no cálculo, mas não é removida da lista original", () => {
    const samples = [
      sample({ id: "1", concentrateConsumed: 10 }),
      sample({ id: "2", concentrateConsumed: 100, status: "excluida", exclusionReason: "vazamento no teste" }),
      sample({ id: "3", concentrateConsumed: 12 }),
    ];
    const stats = computeRecipeStats(samples);
    expect(stats.validSampleCount).toBe(2);
    expect(stats.max).toBe(12); // não 100 — a amostra excluída não influencia o máximo
    expect(stats.median).toBe(11);
  });
});
