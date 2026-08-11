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
    ...overrides,
  };
}

function mapping(overrides: Partial<Pick<ServiceMapping, "canonicalServiceId" | "canonicalServiceName" | "status">> = {}) {
  return { canonicalServiceId: "bronze", canonicalServiceName: "Bronze", status: "mapeado" as const, ...overrides };
}

describe("computeTheoreticalConsumptionForOrder — Histórico Retroativo", () => {
  it("usa referência técnica quando não há calibração real — nunca fica em branco por causa disso", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map([["3x1", 0.5]]),
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
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ status: "aprovada", quantityPerService: 45, sampleCount: 8 })]]]),
      new Map([["3x1", 0.5]]),
    );
    expect(result.lines[0].confidenceTier).toBe("calibrado");
    expect(result.lines[0].quantity).toBe(45);
  });

  it("serviço não mapeado nunca gera linha teórica — vai para unmappedDescriptions", () => {
    const result = computeTheoreticalConsumptionForOrder(["Serviço Desconhecido"], "desconhecido", new Map(), new Map(), new Map());
    expect(result.lines).toHaveLength(0);
    expect(result.unmappedDescriptions).toEqual(["Serviço Desconhecido"]);
  });

  it("mapeamento não confirmado (nao_mapeado) nunca gera linha, mesmo com canonicalServiceId presente", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      new Map([["Lavação Bronze - Hatch", mapping({ status: "nao_mapeado" })]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map(),
    );
    expect(result.lines).toHaveLength(0);
    expect(result.unmappedDescriptions).toEqual(["Lavação Bronze - Hatch"]);
  });

  it("receita sem nenhuma referência (0 amostras e sem técnico) nunca gera linha nem custo inventado", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe({ technicalReferenceQuantity: null })]]]),
      new Map(),
    );
    expect(result.lines).toHaveLength(0);
  });

  it("produto sem custo cadastrado gera linha com cost null — nunca inventa custo", () => {
    const result = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      new Map([["Lavação Bronze - Hatch", mapping()]]),
      new Map([["bronze:sedan", [recipe()]]]),
      new Map(),
    );
    expect(result.lines[0].quantity).toBe(50);
    expect(result.lines[0].unitCost).toBeNull();
    expect(result.lines[0].cost).toBeNull();
  });

  it("Bronze/Silver/Gold da mesma etapa geram a mesma quantidade teórica (nunca infla por pacote)", () => {
    const bronze = computeTheoreticalConsumptionForOrder(
      ["Lavação Bronze - Hatch"],
      "desconhecido",
      new Map([["Lavação Bronze - Hatch", mapping({ canonicalServiceId: "bronze" })]]),
      new Map([["bronze:sedan", [recipe({ serviceId: "bronze" })]]]),
      new Map(),
    );
    const gold = computeTheoreticalConsumptionForOrder(
      ["Lavação Gold - Hatch"],
      "desconhecido",
      new Map([["Lavação Gold - Hatch", mapping({ canonicalServiceId: "gold" })]]),
      new Map([["gold:sedan", [recipe({ serviceId: "gold" })]]]),
      new Map(),
    );
    expect(gold.lines[0].quantity).toBe(bronze.lines[0].quantity);
  });

  it("exemplo da missão: 33 lavações Bronze × 50ml = 1650ml teóricos", () => {
    const orders = Array.from({ length: 33 }, () =>
      computeTheoreticalConsumptionForOrder(
        ["Lavação Bronze - Hatch"],
        "desconhecido",
        new Map([["Lavação Bronze - Hatch", mapping()]]),
        new Map([["bronze:sedan", [recipe()]]]),
        new Map(),
      ),
    );
    const total = orders.reduce((sum, r) => sum + r.lines.reduce((s, l) => s + l.quantity, 0), 0);
    expect(total).toBe(1650);
  });
});
