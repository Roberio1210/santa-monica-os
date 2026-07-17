import { describe, expect, it } from "vitest";
import { computeItemAutonomy } from "@/lib/inventory/autonomy";
import type { InventoryItemView } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

function item(overrides: Partial<InventoryItemView> = {}): InventoryItemView {
  return {
    id: "i1",
    name: "Produto",
    originalName: null,
    brand: "Marca",
    category: "Outros",
    currentQuantity: 1000,
    unit: "ml",
    packageCapacity: null,
    packageCount: null,
    condition: "aberto",
    minimumStock: null,
    notes: null,
    lastCountDate: "2026-07-10",
    unitCost: null,
    quantityStatus: "confirmed",
    status: "sem_minimo",
    stockValue: null,
    fillPercent: null,
    physicalState: "liquido",
    ...overrides,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    serviceId: "s1",
    itemId: "i1",
    vehicleCategory: "hatch",
    processStep: "shampoo",
    quantityPerService: null,
    unit: "ml",
    status: "rascunho",
    version: 1,
    isActiveVersion: true,
    dilutionRatio: null,
    minObserved: null,
    maxObserved: null,
    sampleCount: 0,
    lastCalibratedAt: null,
    notes: null,
    ...overrides,
  };
}

describe("computeItemAutonomy — nunca inventa consumo médio", () => {
  it("retorna 'Aguardando calibração' sem nenhuma receita", () => {
    const result = computeItemAutonomy(item(), []);
    expect(result.services).toBeNull();
    expect(result.reason).toBe("Aguardando calibração");
  });

  it("ignora receitas não aprovadas mesmo com mediana já calculada", () => {
    const r = recipe({ status: "em_calibracao", quantityPerService: 50 });
    const result = computeItemAutonomy(item(), [r]);
    expect(result.services).toBeNull();
  });

  it("calcula serviços restantes a partir de uma receita aprovada na mesma unidade do saldo", () => {
    const r = recipe({ status: "aprovada", quantityPerService: 100, unit: "ml" });
    const result = computeItemAutonomy(item({ currentQuantity: 950 }), [r]);
    expect(result.services).toBe(9);
    expect(result.consumptionPerService).toBe(100);
  });

  it("ignora receita aprovada numa unidade diferente do saldo do item", () => {
    const r = recipe({ status: "aprovada", quantityPerService: 1, unit: "g" });
    const result = computeItemAutonomy(item({ unit: "ml" }), [r]);
    expect(result.services).toBeNull();
  });
});
