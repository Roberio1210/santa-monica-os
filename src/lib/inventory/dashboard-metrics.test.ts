import { describe, expect, it } from "vitest";
import { computeTotalStockValue, isStaleItem, STALE_MOVEMENT_THRESHOLD_DAYS } from "@/lib/inventory/dashboard-metrics";

const NOW = new Date("2026-08-03T12:00:00Z");

describe("isStaleItem", () => {
  it("nunca teve movimentação (null) conta como parado", () => {
    expect(isStaleItem(null, NOW)).toBe(true);
  });

  it(`abaixo de ${STALE_MOVEMENT_THRESHOLD_DAYS} dias não é parado`, () => {
    expect(isStaleItem("2026-07-01", NOW)).toBe(false);
  });

  it(`>= ${STALE_MOVEMENT_THRESHOLD_DAYS} dias é parado`, () => {
    expect(isStaleItem("2026-02-01", NOW)).toBe(true);
  });
});

describe("computeTotalStockValue", () => {
  it("soma só os itens com valor conhecido, nunca inventa o valor de quem não tem custo", () => {
    const result = computeTotalStockValue([{ stockValue: 100 }, { stockValue: 50 }, { stockValue: null }]);
    expect(result.knownValue).toBe(150);
    expect(result.itemsWithoutCost).toBe(1);
  });

  it("sem nenhum item com custo, retorna 0 e expõe a contagem real de itens sem custo", () => {
    const result = computeTotalStockValue([{ stockValue: null }, { stockValue: null }]);
    expect(result.knownValue).toBe(0);
    expect(result.itemsWithoutCost).toBe(2);
  });
});
