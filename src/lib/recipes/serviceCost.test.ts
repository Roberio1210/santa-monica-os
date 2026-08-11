import { describe, expect, it } from "vitest";
import { computeServiceCostEstimate, type RecipeCostInput } from "@/lib/recipes/serviceCost";

function recipe(overrides: Partial<RecipeCostInput> = {}): RecipeCostInput {
  return {
    itemId: "item-1",
    itemName: "Shampoo Automotivo",
    processStep: "shampoo",
    quantityPerService: 50,
    unit: "ml",
    status: "aprovada",
    isActiveVersion: true,
    ...overrides,
  };
}

describe("computeServiceCostEstimate — Custo de Serviço (Instrumentação Gerencial)", () => {
  it("sem nenhuma receita aprovada -> custo parcial, nunca 0 apresentado como fechado", () => {
    const result = computeServiceCostEstimate([recipe({ status: "em_calibracao" })], new Map());
    expect(result.isPartial).toBe(true);
    expect(result.partialReason).toMatch(/nenhuma receita aprovada/i);
    expect(result.knownCost).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("receita aprovada mas produto sem custo cadastrado -> custo parcial, nunca calcula linha como 0", () => {
    const result = computeServiceCostEstimate([recipe()], new Map([["item-1", null]]));
    expect(result.isPartial).toBe(true);
    expect(result.partialReason).toMatch(/sem custo médio cadastrado/i);
    expect(result.lines[0].lineCost).toBeNull();
    expect(result.knownCost).toBe(0);
  });

  it("todas as receitas aprovadas com custo conhecido -> custo fechado, nunca parcial", () => {
    const result = computeServiceCostEstimate(
      [recipe({ itemId: "item-1", quantityPerService: 50 }), recipe({ itemId: "item-2", itemName: "Cera", processStep: "cera", quantityPerService: 20 })],
      new Map([
        ["item-1", 0.5],
        ["item-2", 1.2],
      ]),
    );
    expect(result.isPartial).toBe(false);
    expect(result.partialReason).toBeNull();
    expect(result.knownCost).toBe(49); // 50*0.5 + 20*1.2 = 25 + 24
  });

  it("mistura de produtos com e sem custo -> soma só os conhecidos, mas continua parcial", () => {
    const result = computeServiceCostEstimate(
      [recipe({ itemId: "item-1", quantityPerService: 50 }), recipe({ itemId: "item-2", itemName: "Cera", processStep: "cera", quantityPerService: 20 })],
      new Map([["item-1", 0.5]]), // item-2 sem custo
    );
    expect(result.isPartial).toBe(true);
    expect(result.knownCost).toBe(25); // só a linha conhecida
  });

  it("ignora receitas em rascunho/suspensa/versão inativa — nunca usa receita não aprovada", () => {
    const result = computeServiceCostEstimate(
      [recipe({ status: "rascunho" }), recipe({ status: "suspensa" }), recipe({ isActiveVersion: false })],
      new Map([["item-1", 0.5]]),
    );
    expect(result.isPartial).toBe(true);
    expect(result.lines).toEqual([]);
  });

  it("quantityPerService null (aprovada mas sem mediana calculável) nunca entra no cálculo", () => {
    const result = computeServiceCostEstimate([recipe({ quantityPerService: null })], new Map([["item-1", 0.5]]));
    expect(result.lines).toEqual([]);
    expect(result.isPartial).toBe(true);
  });
});
