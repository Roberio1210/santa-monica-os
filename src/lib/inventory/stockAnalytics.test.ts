import { describe, expect, it } from "vitest";
import {
  aggregateReductionsByCategory,
  aggregateReductionsByProduct,
  buildBalanceEvolution,
  buildPositionRow,
  buildPriceHistory,
  classifyStaleBucket,
  computePositionStatus,
  computeTurnoverRanking,
  deriveStocktakeSessions,
} from "@/lib/inventory/stockAnalytics";
import type { InventoryCategory, InventoryItem, InventoryUnit, StockMovement } from "@/lib/inventory/types";

const LAVAGEM: InventoryCategory = "Lavagem";
const POLIMENTO: InventoryCategory = "Polimento";
const ML: InventoryUnit = "ml";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i1",
    name: "Shampoo Automotivo",
    originalName: null,
    brand: "Vonixx",
    category: "Lavagem",
    currentQuantity: 100,
    unit: "ml",
    packageCapacity: null,
    packageCount: null,
    condition: "aberto",
    minimumStock: 50,
    idealStock: null,
    supplier: null,
    location: null,
    classification: null,
    canonicalItemId: null,
    consolidatedAt: null,
    notes: null,
    lastCountDate: "2026-07-10",
    unitCost: 0.5,
    quantityStatus: "confirmed",
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "m1",
    itemId: "i1",
    type: "compra",
    quantity: 10,
    unit: "ml",
    date: "2026-08-01",
    notes: null,
    responsible: "Robério",
    reference: null,
    supplier: null,
    unitPricePaid: null,
    previousBalance: 90,
    newBalance: 100,
    ...overrides,
  };
}

describe("computePositionStatus", () => {
  it("saldo zero -> ZERADO, mesmo com mínimo configurado e sem estar parado", () => {
    expect(computePositionStatus({ currentQuantity: 0, minimumStock: 10 }, false)).toBe("ZERADO");
  });

  it("saldo <= mínimo -> CRITICO", () => {
    expect(computePositionStatus({ currentQuantity: 10, minimumStock: 10 }, false)).toBe("CRITICO");
  });

  it("saldo <= 1.5x mínimo -> BAIXO", () => {
    expect(computePositionStatus({ currentQuantity: 14, minimumStock: 10 }, false)).toBe("BAIXO");
  });

  it("sem mínimo configurado e parado -> SEM_MOVIMENTACAO (nunca inventa mínimo)", () => {
    expect(computePositionStatus({ currentQuantity: 100, minimumStock: null }, true)).toBe("SEM_MOVIMENTACAO");
  });

  it("acima do mínimo e não parado -> NORMAL", () => {
    expect(computePositionStatus({ currentQuantity: 100, minimumStock: 10 }, false)).toBe("NORMAL");
  });
});

describe("buildPositionRow", () => {
  it("último custo é o preço da última compra COM preço informado, distinto do custo médio", () => {
    const movements = [
      movement({ id: "1", type: "compra", date: "2026-07-01", unitPricePaid: 0.4 }),
      movement({ id: "2", type: "compra", date: "2026-08-01", unitPricePaid: 0.6, supplier: "Fornecedor X" }),
      movement({ id: "3", type: "compra", date: "2026-08-05", unitPricePaid: null }),
    ];
    const row = buildPositionRow(item({ unitCost: 0.55 }), movements, new Date("2026-08-10T00:00:00Z"));
    expect(row.lastCost).toBe(0.6);
    expect(row.averageCost).toBe(0.55);
    expect(row.lastPurchaseSupplier).toBe("Fornecedor X");
  });

  it("stockValue null quando o item não tem custo cadastrado — nunca 0", () => {
    const row = buildPositionRow(item({ unitCost: null }), [], new Date());
    expect(row.stockValue).toBeNull();
  });

  it("nunca movimentado -> SEM_MOVIMENTACAO e daysSinceLastMovement null", () => {
    const row = buildPositionRow(item({ minimumStock: null }), [], new Date());
    expect(row.status).toBe("SEM_MOVIMENTACAO");
    expect(row.daysSinceLastMovement).toBeNull();
  });
});

describe("classifyStaleBucket", () => {
  it("nunca movimentado cai no bucket mais severo (180+)", () => {
    expect(classifyStaleBucket(null)).toBe("180_dias");
  });
  it("menos de 30 dias -> não entra em nenhum bucket (null)", () => {
    expect(classifyStaleBucket(10)).toBeNull();
  });
  it("exatamente 30/60/90/180 -> bucket correspondente (limiar inclusivo)", () => {
    expect(classifyStaleBucket(30)).toBe("30_dias");
    expect(classifyStaleBucket(60)).toBe("60_dias");
    expect(classifyStaleBucket(90)).toBe("90_dias");
    expect(classifyStaleBucket(180)).toBe("180_dias");
  });
});

describe("computeTurnoverRanking", () => {
  it("conta só movimentações de redução real (consumo/perda), ignora compra/ajuste", () => {
    const items = [{ id: "i1", name: "A", category: LAVAGEM, unit: ML }];
    const movementsByItem = new Map([
      ["i1", [movement({ type: "consumo_interno", quantity: 5, date: "2026-08-01" }), movement({ id: "m2", type: "compra", quantity: 100, date: "2026-08-02" }), movement({ id: "m3", type: "perda", quantity: 2, date: "2026-08-03" })]],
    ]);
    const [row] = computeTurnoverRanking(items, movementsByItem);
    expect(row.reductionCount).toBe(2);
    expect(row.reductionQuantity).toBe(7);
    expect(row.lastReductionDate).toBe("2026-08-03");
  });

  it("produto sem nenhuma redução -> reductionCount 0, nunca lança", () => {
    const items = [{ id: "i1", name: "A", category: LAVAGEM, unit: ML }];
    const [row] = computeTurnoverRanking(items, new Map());
    expect(row.reductionCount).toBe(0);
    expect(row.lastReductionDate).toBeNull();
  });
});

describe("aggregateReductionsByProduct / aggregateReductionsByCategory", () => {
  const itemById = new Map([
    ["i1", { id: "i1", name: "A", category: LAVAGEM, unit: ML, unitCost: 2 }],
    ["i2", { id: "i2", name: "B", category: POLIMENTO, unit: "unidade" as InventoryUnit, unitCost: null }],
  ]);

  it("custo estimado = quantidade x custo médio, null quando sem custo cadastrado", () => {
    const movements = [movement({ itemId: "i1", quantity: 10 }), movement({ id: "m2", itemId: "i2", quantity: 3 })];
    const stats = aggregateReductionsByProduct(movements, itemById);
    const a = stats.find((s) => s.itemId === "i1")!;
    const b = stats.find((s) => s.itemId === "i2")!;
    expect(a.estimatedCost).toBe(20);
    expect(b.estimatedCost).toBeNull();
  });

  it("agregação por categoria soma só os custos conhecidos e calcula share corretamente", () => {
    const movements = [movement({ itemId: "i1", quantity: 10 }), movement({ id: "m2", itemId: "i2", quantity: 3 })];
    const productStats = aggregateReductionsByProduct(movements, itemById);
    const categoryStats = aggregateReductionsByCategory(productStats);
    const lavagem = categoryStats.find((c) => c.category === "Lavagem")!;
    expect(lavagem.estimatedCost).toBe(20);
    expect(lavagem.share).toBe(100);
    const polimento = categoryStats.find((c) => c.category === "Polimento")!;
    expect(polimento.itemsWithoutCost).toBe(1);
  });
});

describe("deriveStocktakeSessions", () => {
  it("agrupa por reference e calcula diferença real (newBalance - previousBalance), não a quantidade absoluta", () => {
    const itemById = new Map([["i1", { name: "Produto A" }]]);
    const movements = [
      movement({ id: "1", type: "correcao_inventario", reference: "CONTAGEM-2026-08-01-abc", quantity: 6, previousBalance: 8, newBalance: 6, date: "2026-08-01" }),
    ];
    const [session] = deriveStocktakeSessions(movements, itemById);
    expect(session.lines[0].difference).toBe(-2);
    expect(session.totalNegativeDifference).toBe(-2);
    expect(session.totalPositiveDifference).toBe(0);
  });

  it("movimentações sem reference nunca formam sessão", () => {
    const sessions = deriveStocktakeSessions([movement({ type: "correcao_inventario", reference: null })], new Map());
    expect(sessions).toEqual([]);
  });
});

describe("buildBalanceEvolution", () => {
  it("usa o newBalance real de cada movimentação, ordenado por data — nunca recalcula", () => {
    const movements = [movement({ id: "2", date: "2026-08-02", newBalance: 110 }), movement({ id: "1", date: "2026-08-01", newBalance: 100 })];
    const evolution = buildBalanceEvolution(movements);
    expect(evolution.map((p) => p.balance)).toEqual([100, 110]);
  });
});

describe("buildPriceHistory", () => {
  it("só entradas/compras com preço informado, ordenadas por data", () => {
    const movements = [
      movement({ id: "1", type: "compra", date: "2026-07-01", unitPricePaid: 0.4 }),
      movement({ id: "2", type: "consumo_interno", date: "2026-07-05", unitPricePaid: null }),
      movement({ id: "3", type: "compra", date: "2026-08-01", unitPricePaid: null }),
    ];
    const history = buildPriceHistory(movements);
    expect(history).toHaveLength(1);
    expect(history[0].unitPrice).toBe(0.4);
  });
});
