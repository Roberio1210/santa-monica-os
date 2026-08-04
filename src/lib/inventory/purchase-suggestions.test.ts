import { describe, expect, it } from "vitest";
import { computePurchaseSuggestion } from "@/lib/inventory/purchase-suggestions";
import type { InventoryItemView, StockMovement } from "@/lib/inventory/types";

function makeItem(overrides: Partial<InventoryItemView> = {}): InventoryItemView {
  return {
    id: "item-1",
    name: "3x1 Visão Geral",
    originalName: null,
    brand: "Vonixx",
    category: "Lavagem",
    currentQuantity: 10,
    unit: "L",
    packageCapacity: null,
    packageCount: null,
    condition: "aberto",
    minimumStock: 5,
    idealStock: 20,
    supplier: null,
    location: null,
    classification: "quimico_volume",
    canonicalItemId: null,
    consolidatedAt: null,
    notes: null,
    lastCountDate: "2026-08-01",
    unitCost: 10,
    quantityStatus: "confirmed",
    status: "ok",
    stockValue: 100,
    fillPercent: null,
    physicalState: "liquido",
    ...overrides,
  };
}

function makeMovement(overrides: Partial<StockMovement>): StockMovement {
  return {
    id: "mov-1",
    itemId: "item-1",
    type: "consumo_interno",
    quantity: 1,
    unit: "L",
    date: "2026-08-01",
    notes: null,
    responsible: null,
    reference: null,
    previousBalance: null,
    newBalance: null,
    ...overrides,
  };
}

describe("computePurchaseSuggestion", () => {
  it("dados insuficientes quando não há estoque mínimo configurado", () => {
    const result = computePurchaseSuggestion(makeItem({ minimumStock: null }), []);
    expect(result.status).toBe("dados_insuficientes");
    expect(result.suggestedQuantity).toBeNull();
    expect(result.reason).toMatch(/estoque mínimo/i);
  });

  it("dados insuficientes quando não há histórico de consumo real", () => {
    const result = computePurchaseSuggestion(makeItem(), []);
    expect(result.status).toBe("dados_insuficientes");
    expect(result.reason).toMatch(/histórico de consumo/i);
  });

  it("dados insuficientes com apenas uma data de consumo (sem período para calcular taxa)", () => {
    const movements = [makeMovement({ id: "m1", date: "2026-08-01", quantity: 2 })];
    const result = computePurchaseSuggestion(makeItem(), movements);
    expect(result.status).toBe("dados_insuficientes");
  });

  it("sem necessidade quando saldo está acima do mínimo e não vai esgotar antes da próxima compra", () => {
    const movements = [
      makeMovement({ id: "c1", date: "2026-06-01", quantity: 2 }),
      makeMovement({ id: "c2", date: "2026-07-01", quantity: 2 }),
      // consumo bem lento: 2L em 60 dias = 0.033 L/dia; saldo 10L dura ~300 dias
    ];
    const result = computePurchaseSuggestion(makeItem({ currentQuantity: 10, minimumStock: 5 }), movements);
    expect(result.status).toBe("sem_necessidade");
    expect(result.suggestedQuantity).toBeNull();
    expect(result.consumptionPerDay).not.toBeNull();
  });

  it("sugere compra real quando saldo está no ou abaixo do mínimo, com base em consumo comprovado", () => {
    const movements: StockMovement[] = [
      makeMovement({ id: "c1", type: "consumo_interno", date: "2026-07-01", quantity: 5 }),
      makeMovement({ id: "c2", type: "consumo_interno", date: "2026-07-11", quantity: 5 }),
      // 10L em 10 dias = 1 L/dia
      makeMovement({ id: "p1", type: "entrada", date: "2026-06-01", quantity: 20 }),
      makeMovement({ id: "p2", type: "entrada", date: "2026-07-01", quantity: 20 }),
      // prazo médio entre compras: 30 dias
    ];
    const result = computePurchaseSuggestion(makeItem({ currentQuantity: 4, minimumStock: 5, idealStock: 20 }), movements);

    expect(result.status).toBe("sugerida");
    expect(result.consumptionPerDay).toBe(1);
    expect(result.averageLeadTimeDays).toBe(30);
    // meta 20L - saldo 4L + (1 L/dia * 30 dias de margem) = 46L
    expect(result.suggestedQuantity).toBe(46);
    expect(result.reason).toMatch(/consumo médio/i);
  });

  it("nunca inventa quantidade sugerida quando não há registros de consumo suficientes, mesmo abaixo do mínimo", () => {
    const result = computePurchaseSuggestion(makeItem({ currentQuantity: 1, minimumStock: 5 }), []);
    expect(result.status).toBe("dados_insuficientes");
    expect(result.suggestedQuantity).toBeNull();
  });
});
