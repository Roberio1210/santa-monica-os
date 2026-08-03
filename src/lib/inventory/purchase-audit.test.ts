import { describe, expect, it } from "vitest";
import { computeItemPurchaseStats, computePurchaseStatsForItems } from "@/lib/inventory/purchase-audit";
import type { StockMovement } from "@/lib/inventory/types";

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "mov-1",
    itemId: "item-1",
    type: "compra",
    quantity: 500,
    unit: "ml",
    date: "2026-07-10",
    notes: null,
    responsible: "Robério",
    reference: null,
    supplier: "Distribuidora XPTO",
    unitPricePaid: 0.05,
    previousBalance: 0,
    newBalance: 500,
    ...overrides,
  };
}

describe("computeItemPurchaseStats", () => {
  it("sem nenhuma movimentação de compra, retorna estado honesto de 'sem histórico'", () => {
    const stats = computeItemPurchaseStats("item-1", []);
    expect(stats.purchaseCount).toBe(0);
    expect(stats.averagePrice).toBeNull();
    expect(stats.lastPurchaseDate).toBeNull();
    expect(stats.suppliers).toEqual([]);
  });

  it("ignora movimentações de outros tipos e de outros itens", () => {
    const movements = [movement({ type: "saida" }), movement({ itemId: "item-2" })];
    const stats = computeItemPurchaseStats("item-1", movements);
    expect(stats.purchaseCount).toBe(0);
  });

  it("calcula quantidade total, valor total e preço médio ponderado", () => {
    const movements = [
      movement({ id: "m1", date: "2026-07-01", quantity: 500, unitPricePaid: 0.04 }),
      movement({ id: "m2", date: "2026-07-10", quantity: 1500, unitPricePaid: 0.06 }),
    ];
    const stats = computeItemPurchaseStats("item-1", movements);
    expect(stats.purchaseCount).toBe(2);
    expect(stats.totalQuantityPurchased).toBe(2000);
    expect(stats.totalValuePurchased).toBe(500 * 0.04 + 1500 * 0.06);
    // averagePrice é arredondado para 2 casas (valor monetário) — 0.055 arredonda para 0.06.
    expect(stats.averagePrice).toBe(0.06);
  });

  it("identifica menor, maior e último preço corretamente por data", () => {
    const movements = [
      movement({ id: "m1", date: "2026-07-01", unitPricePaid: 0.08 }),
      movement({ id: "m2", date: "2026-07-15", unitPricePaid: 0.03 }),
      movement({ id: "m3", date: "2026-07-05", unitPricePaid: 0.05 }),
    ];
    const stats = computeItemPurchaseStats("item-1", movements);
    expect(stats.lowestPrice).toBe(0.03);
    expect(stats.highestPrice).toBe(0.08);
    expect(stats.lastPrice).toBe(0.03);
    expect(stats.lastPurchaseDate).toBe("2026-07-15");
  });

  it("monta evolução de preço ordenada por data crescente", () => {
    const movements = [
      movement({ id: "m1", date: "2026-07-15", unitPricePaid: 0.03 }),
      movement({ id: "m2", date: "2026-07-01", unitPricePaid: 0.08 }),
    ];
    const stats = computeItemPurchaseStats("item-1", movements);
    expect(stats.priceEvolution).toEqual([
      { date: "2026-07-01", price: 0.08 },
      { date: "2026-07-15", price: 0.03 },
    ]);
  });

  it("identifica o fornecedor mais frequente", () => {
    const movements = [
      movement({ id: "m1", supplier: "XPTO" }),
      movement({ id: "m2", supplier: "XPTO" }),
      movement({ id: "m3", supplier: "Outro Fornecedor" }),
    ];
    const stats = computeItemPurchaseStats("item-1", movements);
    expect(stats.mostFrequentSupplier).toBe("XPTO");
    expect(stats.suppliers).toEqual([
      { supplier: "XPTO", count: 2 },
      { supplier: "Outro Fornecedor", count: 1 },
    ]);
  });

  it("movimentação de compra sem preço registrado conta na quantidade mas não entra na evolução de preço", () => {
    const movements = [movement({ id: "m1", unitPricePaid: null })];
    const stats = computeItemPurchaseStats("item-1", movements);
    expect(stats.totalQuantityPurchased).toBe(500);
    expect(stats.priceEvolution).toEqual([]);
    expect(stats.averagePrice).toBeNull();
    expect(stats.lastPrice).toBeNull();
  });
});

describe("computePurchaseStatsForItems", () => {
  it("computa estatísticas para múltiplos itens de uma vez", () => {
    const movements = [movement({ itemId: "item-1" }), movement({ id: "m2", itemId: "item-2", unitPricePaid: 0.1 })];
    const result = computePurchaseStatsForItems(["item-1", "item-2", "item-3"], movements);
    expect(result.get("item-1")?.purchaseCount).toBe(1);
    expect(result.get("item-2")?.purchaseCount).toBe(1);
    expect(result.get("item-3")?.purchaseCount).toBe(0);
  });
});
