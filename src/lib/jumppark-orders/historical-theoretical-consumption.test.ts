import { describe, expect, it } from "vitest";
import { computeTheoreticalConsumptionForOrder } from "@/lib/jumppark-orders/historical-theoretical-consumption";
import type { Recipe } from "@/lib/recipes/types";
import type { ServiceMapping } from "@/lib/jumppark-orders/types";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-1",
    serviceId: "bronze",
    itemId: "3x1",
    vehicleCategory: "desconhecido" as Recipe["vehicleCategory"],
    processStep: "pre_lavagem",
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
    technicalReferenceQuantity: 50,
    technicalReferenceSource: "teste",
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

function mapping(overrides: Partial<Pick<ServiceMapping, "canonicalServiceId" | "canonicalServiceName" | "status">> = {}) {
  return { canonicalServiceId: "bronze", canonicalServiceName: "Bronze", status: "mapeado" as const, ...overrides };
}

// Data de ordem/produto neutra usada nos testes que não exercitam a regra de gate por data —
// bem depois do marco (10/07), então nunca interfere no resultado esperado.
const NEUTRAL_ORDER_DATE = "2026-07-20";
const NEUTRAL_START_DATES = new Map([["3x1", "2026-07-10"]]);

describe("computeTheoreticalConsumptionForOrder — Histórico Retroativo", () => {
  it("usa referência técnica quando não há calibração real — nunca fica em branco por causa disso", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map([["3x1", 0.5]]),
      NEUTRAL_START_DATES,
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].confidenceTier).toBe("tecnico");
    expect(result.lines[0].quantity).toBe(50);
    expect(result.lines[0].cost).toBe(25);
  });

  it("prioriza receita aprovada sobre referência técnica quando ambas existem", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ status: "aprovada", quantityPerService: 45, sampleCount: 8 })]]]),
      new Map([["3x1", 0.5]]),
      NEUTRAL_START_DATES,
    );
    expect(result.lines[0].confidenceTier).toBe("calibrado");
    expect(result.lines[0].quantity).toBe(45);
  });

  it("serviço não mapeado nunca gera linha teórica — vai para unmappedDescriptions", () => {
    const result = computeTheoreticalConsumptionForOrder(["Serviço Desconhecido"], "desconhecido", NEUTRAL_ORDER_DATE, new Map(), new Map(), new Map(), NEUTRAL_START_DATES);
    expect(result.lines).toHaveLength(0);
    expect(result.unmappedDescriptions).toEqual(["Serviço Desconhecido"]);
  });

  it("mapeamento não confirmado (nao_mapeado) nunca gera linha, mesmo com canonicalServiceId presente", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping({ status: "nao_mapeado" })]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map(),
      NEUTRAL_START_DATES,
    );
    expect(result.lines).toHaveLength(0);
    expect(result.unmappedDescriptions).toEqual(["Lavação Bronze - Hatch"]);
  });

  it("receita sem nenhuma referência (0 amostras e sem técnico) nunca gera linha nem custo inventado", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ technicalReferenceQuantity: null })]]]),
      new Map(),
      NEUTRAL_START_DATES,
    );
    expect(result.lines).toHaveLength(0);
  });

  it("produto sem custo cadastrado gera linha com cost null — nunca inventa custo", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map(),
      NEUTRAL_START_DATES,
    );
    expect(result.lines[0].quantity).toBe(50);
    expect(result.lines[0].unitCost).toBeNull();
    expect(result.lines[0].cost).toBeNull();
  });

  it("Bronze/Silver/Gold da mesma etapa geram a mesma quantidade teórica (nunca infla por pacote)", () => {
    const bronze = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping({ canonicalServiceId: "bronze" })]]),
      new Map([["bronze:sedan", [recipe({ serviceId: "bronze" })]]]),
      new Map(),
      NEUTRAL_START_DATES,
    );
    const gold = computeTheoreticalConsumptionForOrder(
      ["Lavação Gold - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Gold - Hatch", mapping({ canonicalServiceId: "gold" })]]),
      new Map([["gold:sedan", [recipe({ serviceId: "gold" })]]]),
      new Map(),
      NEUTRAL_START_DATES,
    );
    expect(gold.lines[0].quantity).toBe(bronze.lines[0].quantity);
  });

  it("exemplo da missão: 33 lavações Bronze × 50ml = 1650ml teóricos", () => {
    const orders = Array.from({ length: 33 }, () =>
      computeTheoreticalConsumptionForOrder(
        ["Lavação Bronze - Hatch"],
        "desconhecido",
        NEUTRAL_ORDER_DATE,
        new Map([["Lavação Bronze - Hatch", mapping()]]),
        new Map([["bronze:sedan", [recipe()]]]),
        new Map(),
        NEUTRAL_START_DATES,
      ),
    );
    const total = orders.reduce((sum, r) => sum + r.lines.reduce((s, l) => s + l.quantity, 0), 0);
    expect(total).toBe(1650);
  });
});

describe("computeTheoreticalConsumptionForOrder — gate por data (Missão do Marco Confiável do Histórico de Estoque)", () => {
  it("cenário 1: produto contado em 10/07 não gera consumo em 09/07", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      "2026-07-09",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map(),
      new Map([["3x1", "2026-07-10"]]),
    );
    expect(result.lines).toHaveLength(0);
  });

  it("cenário 2: produto contado em 10/07 pode gerar consumo em 10/07 se possuir receita válida", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      "2026-07-10",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map(),
      new Map([["3x1", "2026-07-10"]]),
    );
    expect(result.lines).toHaveLength(1);
  });

  it("cenário 3: 3x1 (primeira evidência real em 16/07) não gera consumo em 15/07", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      "2026-07-15",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ itemId: "3x1" })]]]),
      new Map(),
      new Map([["3x1", "2026-07-16"]]),
    );
    expect(result.lines).toHaveLength(0);
  });

  it("cenário 4: 3x1 pode gerar consumo em 16/07 (sua própria primeira evidência real)", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      "2026-07-16",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ itemId: "3x1" })]]]),
      new Map(),
      new Map([["3x1", "2026-07-16"]]),
    );
    expect(result.lines).toHaveLength(1);
  });

  it("cenário 5: produto comprado em 17/07 não gera consumo em 16/07", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      "2026-07-16",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ itemId: "delet" })]]]),
      new Map(),
      new Map([["delet", "2026-07-17"]]),
    );
    expect(result.lines).toHaveLength(0);
  });

  it("produto sem nenhuma evidência real (ausente do mapa) nunca gera consumo, mesmo com receita válida configurada", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      NEUTRAL_ORDER_DATE,
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ itemId: "produto-nunca-contado" })]]]),
      new Map(),
      new Map(), // mapa vazio — produto nunca teve nenhuma movimentação real
    );
    expect(result.lines).toHaveLength(0);
  });
});
