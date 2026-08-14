import { describe, expect, it } from "vitest";
import { computeApparentConsumption, computeConsumptionVariance, computeExpectedManagerialConsumption, MANAGERIAL_VEHICLE_SIZE_MULTIPLIER } from "@/lib/inventory/managerial-consumption-variance";
import type { ExpectedConsumptionCell } from "@/lib/inventory/managerial-consumption-variance";

function cell(overrides: Partial<ExpectedConsumptionCell> = {}): ExpectedConsumptionCell {
  return {
    usageType: "standard",
    managerialBaselineQuantity: 10,
    managerialSizeAdjustmentApplicable: false,
    vehicleCategory: "sedan",
    servicesRealized: 10,
    ...overrides,
  };
}

describe("computeExpectedManagerialConsumption — Missão do Modelo de Consumo Médio Gerencial V1, seção 5/7", () => {
  it("STANDARD entra no expected", () => {
    const result = computeExpectedManagerialConsumption([cell({ usageType: "standard", managerialBaselineQuantity: 10, servicesRealized: 10 })]);
    expect(result.expectedConsumption).toBe(100);
    expect(result.cellsIncluded).toBe(1);
  });

  it("ALTERNATIVE não entra automaticamente", () => {
    const result = computeExpectedManagerialConsumption([cell({ usageType: "alternative" })]);
    expect(result.expectedConsumption).toBeNull();
    expect(result.cellsExcludedNotStandard).toBe(1);
  });

  it("CONDITIONAL não entra automaticamente", () => {
    const result = computeExpectedManagerialConsumption([cell({ usageType: "conditional" })]);
    expect(result.expectedConsumption).toBeNull();
    expect(result.cellsExcludedNotStandard).toBe(1);
  });

  it("Good Shine + Luminous Black coexistem como alternativas sem dupla contagem — nenhum dos dois entra no agregado automático", () => {
    const goodShine = cell({ usageType: "alternative", managerialBaselineQuantity: 25, servicesRealized: 40 });
    const luminousBlack = cell({ usageType: "alternative", managerialBaselineQuantity: 25, servicesRealized: 40 });
    const delet = cell({ usageType: "standard", managerialBaselineQuantity: 35, servicesRealized: 40 }); // padrão real de limpeza de pneus, para contraste
    const result = computeExpectedManagerialConsumption([goodShine, luminousBlack, delet]);
    expect(result.expectedConsumption).toBe(1400); // só Delet (35 * 40), nunca soma Good Shine/Luminous
    expect(result.cellsIncluded).toBe(1);
    expect(result.cellsExcludedNotStandard).toBe(2);
  });

  it("multiplicador true aplica MANAGERIAL_VEHICLE_SIZE_MULTIPLIER (caminhonete)", () => {
    const result = computeExpectedManagerialConsumption([cell({ managerialSizeAdjustmentApplicable: true, vehicleCategory: "caminhonete", managerialBaselineQuantity: 10, servicesRealized: 10 })]);
    expect(result.expectedConsumption).toBe(130); // 10 * 10 * 1.30
  });

  it("multiplicador false mantém fator 1.00 mesmo em categoria diferente de sedan", () => {
    const result = computeExpectedManagerialConsumption([cell({ managerialSizeAdjustmentApplicable: false, vehicleCategory: "caminhonete", managerialBaselineQuantity: 10, servicesRealized: 10 })]);
    expect(result.expectedConsumption).toBe(100); // sem ajuste, apesar de caminhonete
  });

  it("Missão de Estoque Gerencial V2, seção 1 — SUV e SEDAN têm o MESMO fator gerencial (1.00), decisão de negócio explícita", () => {
    const suvCell = cell({ managerialSizeAdjustmentApplicable: true, vehicleCategory: "suv", managerialBaselineQuantity: 15, servicesRealized: 20 });
    const sedanCell = cell({ managerialSizeAdjustmentApplicable: true, vehicleCategory: "sedan", managerialBaselineQuantity: 15, servicesRealized: 20 });
    const suvResult = computeExpectedManagerialConsumption([suvCell]);
    const sedanResult = computeExpectedManagerialConsumption([sedanCell]);
    expect(suvResult.expectedConsumption).toBe(300); // 15 * 20 * 1.00 (não mais 1.15)
    expect(suvResult.expectedConsumption).toBe(sedanResult.expectedConsumption);
  });

  it("Blend Spray (multiplicador true) e Atomic (multiplicador false) podem compartilhar o mesmo process_step sem compartilhar a regra de multiplicador — cada célula decide por si", () => {
    const blendSpray = cell({ managerialSizeAdjustmentApplicable: true, vehicleCategory: "caminhonete", managerialBaselineQuantity: 15, servicesRealized: 20 });
    const atomic = cell({ managerialSizeAdjustmentApplicable: false, vehicleCategory: "caminhonete", managerialBaselineQuantity: 5, servicesRealized: 20 });
    const blendResult = computeExpectedManagerialConsumption([blendSpray]);
    const atomicResult = computeExpectedManagerialConsumption([atomic]);
    expect(blendResult.expectedConsumption).toBe(390); // 15 * 20 * 1.30
    expect(atomicResult.expectedConsumption).toBe(100); // 5 * 20 * 1.00 — mesmo estando ambos, hipoteticamente, em "protecao_externa"
  });

  it("célula STANDARD sem baseline configurado é excluída, nunca inventa valor", () => {
    const result = computeExpectedManagerialConsumption([cell({ managerialBaselineQuantity: null })]);
    expect(result.expectedConsumption).toBeNull();
    expect(result.cellsExcludedNoBaseline).toBe(1);
  });

  it("soma corretamente várias células standard de serviços/categorias diferentes (ex.: 3x1 em Bronze+Silver+Gold × 4 categorias)", () => {
    const cells = (["hatch", "sedan", "suv", "caminhonete"] as const).flatMap((vehicleCategory) =>
      [1, 1, 1].map(() => cell({ managerialSizeAdjustmentApplicable: true, vehicleCategory, managerialBaselineQuantity: 125, servicesRealized: 10 })),
    );
    const result = computeExpectedManagerialConsumption(cells);
    // 3 serviços x (10*125*0.90 + 10*125*1.00 + 10*125*1.00 + 10*125*1.30) = 3 * (1125+1250+1250+1625) — suv agora = sedan
    expect(result.expectedConsumption).toBe(3 * (1125 + 1250 + 1250 + 1625));
    expect(result.cellsIncluded).toBe(12);
  });
});

describe("MANAGERIAL_VEHICLE_SIZE_MULTIPLIER — Missão de Estoque Gerencial V2, seção 1/19", () => {
  it("Sedan → fator 1.00", () => {
    expect(MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.sedan).toBe(1.0);
  });

  it("SUV → fator 1.00 (era 1.15 na V1 — mudou por decisão do gestor)", () => {
    expect(MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.suv).toBe(1.0);
  });

  it("Hatch permanece 0.90", () => {
    expect(MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.hatch).toBe(0.9);
  });

  it("Caminhonete permanece 1.30", () => {
    expect(MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.caminhonete).toBe(1.3);
  });
});

describe("computeApparentConsumption — Missão do Modelo de Consumo Médio Gerencial V1, seção 8/9", () => {
  it("estoque inicial + entradas - estoque atual = consumo aparente", () => {
    const result = computeApparentConsumption({ openingQuantity: 100, entradas: 50, currentQuantity: 30 });
    expect(result).toBe(120);
  });

  it("ausência de estoque inicial confiável não fabrica consumo — retorna null", () => {
    const result = computeApparentConsumption({ openingQuantity: null, entradas: 50, currentQuantity: 30 });
    expect(result).toBeNull();
  });

  it("ausência de estoque atual confiável não fabrica consumo — retorna null", () => {
    const result = computeApparentConsumption({ openingQuantity: 100, entradas: 50, currentQuantity: null });
    expect(result).toBeNull();
  });

  it("zero entradas no período ainda calcula normalmente", () => {
    const result = computeApparentConsumption({ openingQuantity: 100, entradas: 0, currentQuantity: 40 });
    expect(result).toBe(60);
  });
});

describe("computeConsumptionVariance — Missão do Modelo de Consumo Médio Gerencial V1, seção 9", () => {
  it("NORMAL — exemplo da missão: expected=5.0L, tolerância=25%, aparente=5.4L", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 5.4, tolerancePercentage: 25 });
    expect(result.status).toBe("NORMAL");
    expect(result.varianceAbsolute).toBe(0.4);
  });

  it("HIGH_CONSUMPTION — exemplo da missão: expected=5.0L, tolerância=25%, aparente=7.5L", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 7.5, tolerancePercentage: 25 });
    expect(result.status).toBe("HIGH_CONSUMPTION");
  });

  it("LOW_CONSUMPTION — exemplo da missão: expected=5.0L, tolerância=25%, aparente=2.0L", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 2.0, tolerancePercentage: 25 });
    expect(result.status).toBe("LOW_CONSUMPTION");
  });

  it("ATTENTION — fora da faixa de tolerância mas ainda dentro do dobro dela", () => {
    // expected=5.0, tolerância=25% → banda normal [3.75,6.25], banda de atenção [2.5,7.5]
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 6.8, tolerancePercentage: 25 });
    expect(result.status).toBe("ATTENTION");
  });

  it("ATTENTION no lado baixo, simetricamente", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 3.0, tolerancePercentage: 25 });
    expect(result.status).toBe("ATTENTION");
  });

  it("INSUFFICIENT_DATA quando expectedConsumption é null", () => {
    const result = computeConsumptionVariance({ expectedConsumption: null, apparentConsumption: 5.4, tolerancePercentage: 25 });
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.varianceAbsolute).toBeNull();
  });

  it("INSUFFICIENT_DATA quando apparentConsumption é null (ausência de estoque confiável não fabrica consumo)", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: null, tolerancePercentage: 25 });
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA quando tolerancePercentage é null (produto sem tolerância configurada — nunca usa tolerância universal)", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 5.4, tolerancePercentage: null });
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });

  it("tolerância por produto — o mesmo desvio percentual classifica diferente conforme a tolerância do produto", () => {
    // 20% acima do esperado: NORMAL com tolerância 25%, mas fora da faixa com tolerância 10%
    const toleranciaAlta = computeConsumptionVariance({ expectedConsumption: 10, apparentConsumption: 12, tolerancePercentage: 25 });
    const toleranciaBaixa = computeConsumptionVariance({ expectedConsumption: 10, apparentConsumption: 12, tolerancePercentage: 10 });
    expect(toleranciaAlta.status).toBe("NORMAL");
    expect(toleranciaBaixa.status).not.toBe("NORMAL");
  });

  it("nunca bloqueia nem gera efeito colateral — é só classificação (mesmo em HIGH_CONSUMPTION, o resultado é só um status/rótulo)", () => {
    const result = computeConsumptionVariance({ expectedConsumption: 5.0, apparentConsumption: 100, tolerancePercentage: 25 });
    expect(result.status).toBe("HIGH_CONSUMPTION");
    expect(typeof result.status).toBe("string");
    expect(Object.keys(result)).toEqual(["varianceAbsolute", "variancePercentage", "confidence", "status"]);
  });
});
