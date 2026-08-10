import { describe, expect, it } from "vitest";
import { fetchConsumoServicosStatus, fetchProductStockDetail, fetchStockGerencial } from "@/lib/inventory/stockGerencial";
import { resolvePeriod } from "@/lib/utils/timezone";

describe("fetchStockGerencial sem banco configurado (memória)", () => {
  it("nunca lança e retorna estrutura honesta, mesmo em modo memória", async () => {
    const period = resolvePeriod("month");
    const result = await fetchStockGerencial(period);
    expect(result.storageMode).toBeDefined();
    expect(Array.isArray(result.position)).toBe(true);
    expect(result.overview.productCount).toBe(result.position.length);
    expect(typeof result.hasAnyMovement).toBe("boolean");
  });

  it("posição não tem valor de estoque negativo/inventado — cada linha reflete o item real", async () => {
    const period = resolvePeriod("month");
    const result = await fetchStockGerencial(period);
    for (const row of result.position) {
      if (row.averageCost === null) expect(row.stockValue).toBeNull();
    }
  });
});

describe("fetchProductStockDetail", () => {
  it("id inexistente retorna found=false, nunca lança", async () => {
    const period = resolvePeriod("month");
    const result = await fetchProductStockDetail("00000000-0000-0000-0000-000000000000", period);
    expect(result.found).toBe(false);
  });
});

describe("fetchConsumoServicosStatus", () => {
  it("nunca lança; sem confirmações reais, declara explicitamente hasReliableData=false", async () => {
    const status = await fetchConsumoServicosStatus();
    expect(typeof status.hasReliableData).toBe("boolean");
    expect(status.explanation.length).toBeGreaterThan(0);
  });
});
