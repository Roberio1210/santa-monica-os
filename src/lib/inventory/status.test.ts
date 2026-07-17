import { describe, expect, it } from "vitest";
import { computeFillPercent, computeStatus, computeStockValue, derivePhysicalState, toItemView } from "@/lib/inventory/status";
import type { InventoryItem } from "@/lib/inventory/types";

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Produto Teste",
    originalName: null,
    brand: "Marca",
    category: "Outros",
    currentQuantity: 500,
    unit: "ml",
    packageCapacity: 1000,
    packageCount: 1,
    condition: "aberto",
    minimumStock: null,
    notes: null,
    lastCountDate: "2026-07-10",
    unitCost: null,
    quantityStatus: "confirmed",
    ...overrides,
  };
}

describe("derivePhysicalState — nunca converte peso em volume nem volume em peso", () => {
  it.each([
    ["ml", "liquido"],
    ["L", "liquido"],
    ["g", "massa"],
    ["kg", "massa"],
    ["unidade", "peca"],
    ["caixa", "peca"],
  ] as const)("unidade %s deriva estado %s", (unit, expected) => {
    expect(derivePhysicalState(unit)).toBe(expected);
  });
});

describe("computeStatus — nunca infere estoque mínimo", () => {
  it("retorna sem_minimo quando minimumStock é null", () => {
    expect(computeStatus({ currentQuantity: 500, minimumStock: null })).toBe("sem_minimo");
  });

  it("retorna comprar quando o saldo está no mínimo ou abaixo", () => {
    expect(computeStatus({ currentQuantity: 100, minimumStock: 100 })).toBe("comprar");
  });

  it("retorna atencao entre o mínimo e 1.5x o mínimo", () => {
    expect(computeStatus({ currentQuantity: 140, minimumStock: 100 })).toBe("atencao");
  });

  it("retorna ok acima de 1.5x o mínimo", () => {
    expect(computeStatus({ currentQuantity: 200, minimumStock: 100 })).toBe("ok");
  });
});

describe("computeFillPercent / computeStockValue — nunca inventam dado ausente", () => {
  it("retorna null quando packageCapacity é desconhecido", () => {
    expect(computeFillPercent({ currentQuantity: 500, packageCapacity: null, packageCount: 1 })).toBeNull();
  });

  it("calcula o percentual considerando packageCount", () => {
    expect(computeFillPercent({ currentQuantity: 500, packageCapacity: 500, packageCount: 2 })).toBe(50);
  });

  it("retorna null de custo quando unitCost é desconhecido", () => {
    expect(computeStockValue({ currentQuantity: 500, unitCost: null })).toBeNull();
  });
});

describe("toItemView", () => {
  it("compõe status, stockValue, fillPercent e physicalState num único objeto", () => {
    const view = toItemView(baseItem({ currentQuantity: 500, packageCapacity: 1000, unitCost: 0.1, minimumStock: 200 }));
    expect(view.status).toBe("ok");
    expect(view.stockValue).toBe(50);
    expect(view.fillPercent).toBe(50);
    expect(view.physicalState).toBe("liquido");
  });
});
