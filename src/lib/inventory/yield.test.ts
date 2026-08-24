import { describe, expect, it } from "vitest";
import { computeItemYield, computeManagerialYield, pickRecipeReference } from "@/lib/inventory/yield";
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
    usageType: null,
    technicalFunction: null,
    informationSource: null,
    dilutionBasis: null,
    managerialBaselineQuantity: null,
    managerialTolerancePercentage: null,
    managerialBaselineSource: null,
    managerialBaselineSince: null,
    managerialSizeAdjustmentApplicable: false,
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

  it('Missão de compras 21/22-08-2026 — ferramenta/equipamento reutilizável (1 unidade, sem receita de consumo associada) NUNCA vira "1 serviço restante" nem qualquer estimativa de rendimento', () => {
    // Mesmo cenário real de "Kit 5 Pincéis" (ferramenta) e "Pulverizador Snow Foam" (equipamento):
    // 1 unidade em estoque, nenhuma serviceConsumptionRules associada (nunca criada para eles).
    const result = computeItemYield({ currentQuantity: 1, unit: "unidade" }, [], [], TODAY);
    expect(result.estimatedServicesRemaining).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.forecastDays).toBeNull();
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

describe("pickRecipeReference — Missão do Modelo de Consumo Médio Gerencial V1 (tier 'gerencial')", () => {
  it("gerencial quando há baseline gerencial mas nenhuma amostra real e nenhuma referência técnica", () => {
    const result = pickRecipeReference(recipe({ managerialBaselineQuantity: 125, sampleCount: 0, technicalReferenceQuantity: null }));
    expect(result).toEqual({ value: 125, confidence: "gerencial" });
  });

  it("gerencial vence tecnico quando os dois existem mas nenhuma calibração real existe", () => {
    const result = pickRecipeReference(recipe({ managerialBaselineQuantity: 125, technicalReferenceQuantity: 50, sampleCount: 0 }));
    expect(result).toEqual({ value: 125, confidence: "gerencial" });
  });

  it("em_calibracao vence gerencial quando há amostra real, mesmo que baseline gerencial também exista", () => {
    const result = pickRecipeReference(recipe({ status: "em_calibracao", quantityPerService: 30, sampleCount: 3, managerialBaselineQuantity: 125, technicalReferenceQuantity: 50 }));
    expect(result).toEqual({ value: 30, confidence: "em_calibracao" });
  });

  it("calibrado vence gerencial quando a receita está aprovada, mesmo que baseline gerencial também exista", () => {
    const result = pickRecipeReference(recipe({ status: "aprovada", quantityPerService: 20, sampleCount: 8, managerialBaselineQuantity: 125, technicalReferenceQuantity: 50 }));
    expect(result).toEqual({ value: 20, confidence: "calibrado" });
  });

  it("uma receita pode possuir technicalReferenceQuantity + managerialBaselineQuantity + quantityPerService simultaneamente — prioridade calibrado > em_calibracao > gerencial > tecnico, nenhum trilho é apagado pelos outros", () => {
    const full = recipe({
      status: "aprovada",
      quantityPerService: 20,
      sampleCount: 8,
      managerialBaselineQuantity: 125,
      managerialTolerancePercentage: 25,
      technicalReferenceQuantity: 50,
      technicalReferenceSource: "referência técnica antiga",
    });
    // os três trilhos continuam presentes no objeto — a função só ESCOLHE qual usar, nunca apaga os outros.
    expect(full.technicalReferenceQuantity).toBe(50);
    expect(full.managerialBaselineQuantity).toBe(125);
    expect(full.quantityPerService).toBe(20);
    expect(pickRecipeReference(full)).toEqual({ value: 20, confidence: "calibrado" });

    // mesma receita, sem status aprovada nem amostra (simulando antes da calibração real chegar) — gerencial vence tecnico.
    const semCalibracaoReal = recipe({ ...full, status: "rascunho", quantityPerService: null, sampleCount: 0 });
    expect(pickRecipeReference(semCalibracaoReal)).toEqual({ value: 125, confidence: "gerencial" });
  });

  it("tecnico quando só há referência técnica, sem baseline gerencial e sem amostra real", () => {
    const result = pickRecipeReference(recipe({ technicalReferenceQuantity: 50, sampleCount: 0, managerialBaselineQuantity: null }));
    expect(result).toEqual({ value: 50, confidence: "tecnico" });
  });

  it("null quando a receita está suspensa, mesmo com baseline gerencial configurado", () => {
    const result = pickRecipeReference(recipe({ status: "suspensa", managerialBaselineQuantity: 125 }));
    expect(result).toBeNull();
  });

  it("computeItemYield usa o baseline gerencial (confidence='gerencial') quando é a melhor referência disponível", () => {
    const result = computeItemYield({ currentQuantity: 500, unit: "ml" }, [], [recipe({ managerialBaselineQuantity: 10 })], TODAY);
    expect(result.confidence).toBe("gerencial");
    expect(result.technicalConsumption).toBe(10);
    expect(result.estimatedServicesRemaining).toBe(50);
  });
});

describe("computeManagerialYield — Missão do Modelo de Consumo Médio Gerencial V1, seção 6", () => {
  it("exemplo da missão: V-Floc, embalagem de 500 ml e baseline de 10 ml/serviço → 50 serviços", () => {
    const result = computeManagerialYield(500, 10);
    expect(result.expectedServicesPerPackage).toBe(50);
    expect(result.label).toBe("RENDIMENTO GERENCIAL ESTIMADO");
  });

  it("null quando packageCapacity é desconhecido — nunca inventa", () => {
    const result = computeManagerialYield(null, 10);
    expect(result.expectedServicesPerPackage).toBeNull();
  });

  it("null quando managerialBaselineQuantity é desconhecido — nunca inventa", () => {
    const result = computeManagerialYield(500, null);
    expect(result.expectedServicesPerPackage).toBeNull();
  });

  it("arredonda para baixo (rendimento nunca otimista)", () => {
    const result = computeManagerialYield(100, 4);
    expect(result.expectedServicesPerPackage).toBe(25);
    const result2 = computeManagerialYield(100, 3);
    expect(result2.expectedServicesPerPackage).toBe(33);
  });
});
