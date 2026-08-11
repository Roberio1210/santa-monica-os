import { describe, expect, it } from "vitest";
import { computeItemYield } from "@/lib/inventory/yield";
import type { StockMovement } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

const TODAY = "2026-08-11";

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "m1",
    itemId: "i1",
    type: "consumo_interno",
    quantity: 10,
    unit: "ml",
    date: TODAY,
    responsible: "Robério",
    reference: null,
    supplier: null,
    unitPricePaid: null,
    previousBalance: 100,
    newBalance: 90,
    externalId: null,
    notes: null,
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
    technicalReferenceQuantity: null,
    technicalReferenceSource: null,
    ...overrides,
  };
}

describe("computeItemYield — rendimento de estoque (Automação JumpPark → Consumo, seção 9)", () => {
  it("exemplo da missão: 3x1 com 3500ml de saldo e 50ml técnico/lavagem → 70 lavagens", () => {
    const result = computeItemYield(
      { currentQuantity: 3500, unit: "ml" },
      [],
      [recipe({ technicalReferenceQuantity: 50, sampleCount: 0 })],
      TODAY,
    );
    expect(result.confidence).toBe("tecnico");
    expect(result.technicalConsumption).toBe(50);
    expect(result.estimatedServicesRemaining).toBe(70);
  });

  it("prioriza receita aprovada (calibrado) sobre referência técnica quando ambas existem para itens diferentes", () => {
    const result = computeItemYield(
      { currentQuantity: 1000, unit: "ml" },
      [],
      [recipe({ status: "aprovada", quantityPerService: 20, sampleCount: 8 })],
      TODAY,
    );
    expect(result.confidence).toBe("calibrado");
    expect(result.estimatedServicesRemaining).toBe(50);
  });

  it("em_calibracao quando há amostras reais mas ainda não aprovada", () => {
    const result = computeItemYield({ currentQuantity: 500, unit: "ml" }, [], [recipe({ status: "em_calibracao", quantityPerService: 25, sampleCount: 2 })], TODAY);
    expect(result.confidence).toBe("em_calibracao");
  });

  it("sem nenhuma receita com dado configurado, rendimento é null — nunca inventa consumo", () => {
    const result = computeItemYield({ currentQuantity: 500, unit: "ml" }, [], [], TODAY);
    expect(result.confidence).toBeNull();
    expect(result.technicalConsumption).toBeNull();
    expect(result.estimatedServicesRemaining).toBeNull();
  });

  it("soma consumo (tipos de redução real) dos últimos 7 e 30 dias corretamente", () => {
    const movements: StockMovement[] = [
      movement({ id: "m1", type: "consumo_interno", quantity: 10, date: "2026-08-11" }),
      movement({ id: "m2", type: "consumo_interno", quantity: 20, date: "2026-08-06" }),
      movement({ id: "m3", type: "perda", quantity: 5, date: "2026-07-20" }),
      movement({ id: "m4", type: "compra", quantity: 1000, date: "2026-08-10" }),
    ];
    const result = computeItemYield({ currentQuantity: 100, unit: "ml" }, movements, [], TODAY);
    expect(result.consumption7d).toBe(30);
    expect(result.consumption30d).toBe(35);
  });

  it("previsão de dias é null quando não há consumo médio (nunca 'infinito' inventado)", () => {
    const result = computeItemYield({ currentQuantity: 100, unit: "ml" }, [], [], TODAY);
    expect(result.avgDailyConsumption).toBe(0);
    expect(result.forecastDays).toBeNull();
  });

  it("previsão de dias calculada a partir da média diária real", () => {
    const movements: StockMovement[] = Array.from({ length: 10 }, (_, i) => movement({ id: `m${i}`, type: "consumo_interno", quantity: 30, date: TODAY }));
    const result = computeItemYield({ currentQuantity: 600, unit: "ml" }, movements, [], TODAY);
    expect(result.consumption30d).toBe(300);
    expect(result.avgDailyConsumption).toBe(10);
    expect(result.forecastDays).toBe(60);
  });
});
