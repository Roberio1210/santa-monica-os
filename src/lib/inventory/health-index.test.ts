import { describe, expect, it } from "vitest";
import { computeHealthIndex, HEALTH_DIMENSION_WEIGHTS } from "@/lib/inventory/health-index";
import type { DataQualitySummaryCounts } from "@/lib/inventory/data-quality-audit";

function summary(overrides: Partial<DataQualitySummaryCounts> = {}): DataQualitySummaryCounts {
  return {
    totalProducts: 10,
    completeProducts: 10,
    incompleteProducts: 0,
    withoutCost: 0,
    withoutSupplier: 0,
    withoutLocation: 0,
    withoutMinimumStock: 0,
    withoutIdealStock: 0,
    withoutMovement: 0,
    negativeBalance: 0,
    inconsistentUnit: 0,
    withoutEntryHistory: 0,
    consumedWithoutEntry: 0,
    ...overrides,
  };
}

describe("HEALTH_DIMENSION_WEIGHTS", () => {
  it("os pesos documentados somam exatamente 100", () => {
    const total = Object.values(HEALTH_DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });
});

describe("computeHealthIndex", () => {
  it("catálogo perfeito (tudo completo, nenhum problema) tira 100", () => {
    const result = computeHealthIndex({ summary: summary(), unresolvedDuplicateSuspectCount: 0, totalMovements: 20, movementsWithoutResponsible: 0 });
    expect(result.overallScore).toBe(100);
    expect(result.dimensions.every((d) => d.score === 100)).toBe(true);
    expect(result.topActions).toEqual([]);
  });

  it("catálogo totalmente incompleto tira 0 nas dimensões de completude/custo/fornecedor", () => {
    const result = computeHealthIndex({
      summary: summary({ completeProducts: 0, withoutCost: 10, withoutSupplier: 10, withoutMinimumStock: 10, withoutIdealStock: 10 }),
      unresolvedDuplicateSuspectCount: 0,
      totalMovements: 0,
      movementsWithoutResponsible: 0,
    });
    expect(result.dimensions.find((d) => d.id === "completude_cadastral")?.score).toBe(0);
    expect(result.dimensions.find((d) => d.id === "presenca_custos")?.score).toBe(0);
    expect(result.dimensions.find((d) => d.id === "presenca_fornecedor")?.score).toBe(0);
    expect(result.overallScore).toBeLessThan(100);
  });

  it("saldo negativo reduz especificamente a dimensão de consistência de saldos", () => {
    const result = computeHealthIndex({ summary: summary({ negativeBalance: 5 }), unresolvedDuplicateSuspectCount: 0, totalMovements: 0, movementsWithoutResponsible: 0 });
    expect(result.dimensions.find((d) => d.id === "consistencia_saldos")?.score).toBe(50);
  });

  it("duplicidades não resolvidas nunca deixam a dimensão abaixo de 0", () => {
    const result = computeHealthIndex({ summary: summary(), unresolvedDuplicateSuspectCount: 999, totalMovements: 0, movementsWithoutResponsible: 0 });
    expect(result.dimensions.find((d) => d.id === "ausencia_duplicidades")?.score).toBe(0);
  });

  it("catálogo vazio (0 produtos) nunca gera NaN — trata como 100 por convenção documentada", () => {
    const result = computeHealthIndex({ summary: summary({ totalProducts: 0, completeProducts: 0 }), unresolvedDuplicateSuspectCount: 0, totalMovements: 0, movementsWithoutResponsible: 0 });
    expect(Number.isNaN(result.overallScore)).toBe(false);
    expect(result.overallScore).toBe(100);
  });

  it("ações recomendadas priorizam a dimensão com maior peso × pior score", () => {
    const result = computeHealthIndex({
      summary: summary({ completeProducts: 0, negativeBalance: 0 }),
      unresolvedDuplicateSuspectCount: 0,
      totalMovements: 0,
      movementsWithoutResponsible: 0,
    });
    expect(result.topActions[0]).toContain("Completude cadastral");
  });
});
