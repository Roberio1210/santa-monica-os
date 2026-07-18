import { describe, expect, it } from "vitest";
import { computeConsumptionPreview, type PreviewInput, type PreviewItem, type PreviewServiceMapping } from "@/lib/orders/preview";
import type { Recipe } from "@/lib/recipes/types";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-1",
    serviceId: "service-1",
    itemId: "item-1",
    vehicleCategory: "hatch",
    processStep: "shampoo",
    quantityPerService: 100,
    unit: "ml",
    status: "aprovada",
    version: 1,
    isActiveVersion: true,
    dilutionRatio: null,
    minObserved: 90,
    maxObserved: 110,
    sampleCount: 5,
    lastCalibratedAt: "2026-07-15",
    notes: null,
    ...overrides,
  };
}

function item(overrides: Partial<PreviewItem> = {}): PreviewItem {
  return { id: "item-1", name: "V-Floc Shampoo", unit: "ml", currentQuantity: 5000, unitCost: 0.05, ...overrides };
}

function mapped(canonicalServiceId = "service-1", canonicalServiceName = "Bronze"): PreviewServiceMapping {
  return { canonicalServiceId, canonicalServiceName, status: "mapeado" };
}

function baseInput(overrides: Partial<PreviewInput> = {}): PreviewInput {
  return {
    externalId: "order-1",
    services: [{ description: "Lavagem Bronze", amount: 80 }],
    vehicleCategory: "hatch",
    activeConfirmationId: null,
    serviceMappings: new Map([["Lavagem Bronze", mapped()]]),
    recipesByService: new Map([["service-1:hatch", [recipe()]]]),
    itemsById: new Map([["item-1", item()]]),
    ...overrides,
  };
}

describe("computeConsumptionPreview — estado pronta", () => {
  it("todos os serviços mapeados, categoria confirmada, receita aprovada: pronta", () => {
    const result = computeConsumptionPreview(baseInput());
    expect(result.state).toBe("pronta");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].expectedQuantity).toBe(100);
    expect(result.lines[0].projectedBalance).toBe(4900);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it("custo conhecido é somado quando todo item tem unitCost cadastrado", () => {
    const result = computeConsumptionPreview(baseInput());
    expect(result.knownCostTotal).toBe(5); // 100ml * 0.05
    expect(result.costIncomplete).toBe(false);
  });

  it("custo desconhecido é sinalizado, nunca tratado como bloqueio", () => {
    const result = computeConsumptionPreview(baseInput({ itemsById: new Map([["item-1", item({ unitCost: null })]]) }));
    expect(result.state).toBe("pronta");
    expect(result.knownCostTotal).toBeNull();
    expect(result.costIncomplete).toBe(true);
  });

  it("saldo insuficiente é sinalizado, nunca bloqueia a prévia (a regra dura é só na confirmação)", () => {
    const result = computeConsumptionPreview(baseInput({ itemsById: new Map([["item-1", item({ currentQuantity: 50 })]]) }));
    expect(result.state).toBe("pronta");
    expect(result.itemsWithInsufficientBalance).toHaveLength(1);
    expect(result.lines[0].hasSufficientBalance).toBe(false);
  });
});

describe("computeConsumptionPreview — estado bloqueada", () => {
  it("categoria desconhecida bloqueia mesmo com tudo mapeado", () => {
    const result = computeConsumptionPreview(baseInput({ vehicleCategory: "desconhecido" }));
    expect(result.state).toBe("bloqueada");
    expect(result.blockingReasons.some((r) => r.includes("Categoria"))).toBe(true);
  });

  it("serviço não mapeado bloqueia a ordem inteira, preservando o texto original", () => {
    const result = computeConsumptionPreview(baseInput({ serviceMappings: new Map() }));
    expect(result.state).toBe("bloqueada");
    expect(result.unmappedServices).toEqual([{ serviceLineDescription: "Lavagem Bronze" }]);
  });

  it("serviço com status nao_mapeado explícito também bloqueia", () => {
    const result = computeConsumptionPreview(
      baseInput({ serviceMappings: new Map([["Lavagem Bronze", { canonicalServiceId: null, canonicalServiceName: null, status: "nao_mapeado" }]]) }),
    );
    expect(result.state).toBe("bloqueada");
    expect(result.unmappedServices).toHaveLength(1);
  });

  it("nenhuma receita aprovada: bloqueada com mensagem amigável, não crítica", () => {
    const result = computeConsumptionPreview(baseInput({ recipesByService: new Map([["service-1:hatch", [recipe({ status: "em_calibracao" })]]]) }));
    expect(result.state).toBe("bloqueada");
    expect(result.servicesWithoutApprovedRecipe[0].reason).toBe("Consumo indisponível: receita ainda não calibrada.");
  });

  it("receita suspensa não conta como aprovada", () => {
    const result = computeConsumptionPreview(baseInput({ recipesByService: new Map([["service-1:hatch", [recipe({ status: "suspensa" })]]]) }));
    expect(result.state).toBe("bloqueada");
    expect(result.servicesWithoutApprovedRecipe).toHaveLength(1);
  });

  it("ordem já com confirmação ativa é bloqueada por completo, sem gerar linhas", () => {
    const result = computeConsumptionPreview(baseInput({ activeConfirmationId: "confirmation-1" }));
    expect(result.state).toBe("bloqueada");
    expect(result.alreadyConsumed).toBe(true);
    expect(result.lines).toHaveLength(0);
  });

  it("inconsistência de unidade entre receita e produto bloqueia a ordem", () => {
    const result = computeConsumptionPreview(baseInput({ itemsById: new Map([["item-1", item({ unit: "g" })]]) }));
    expect(result.state).toBe("bloqueada");
    expect(result.unitMismatches).toHaveLength(1);
  });

  it("produto inexistente é listado sem inventar dado", () => {
    const result = computeConsumptionPreview(baseInput({ itemsById: new Map() }));
    expect(result.itemsWithoutProduct).toHaveLength(1);
    expect(result.lines).toHaveLength(0);
  });
});

describe("computeConsumptionPreview — estado parcial", () => {
  it("parte dos serviços com receita aprovada, parte sem: parcial, nunca confirma silenciosamente a parte incompleta", () => {
    const result = computeConsumptionPreview(
      baseInput({
        services: [
          { description: "Lavagem Bronze", amount: 80 },
          { description: "Vitrificação", amount: 300 },
        ],
        serviceMappings: new Map([
          ["Lavagem Bronze", mapped("service-1", "Bronze")],
          ["Vitrificação", mapped("service-2", "Vitrificação")],
        ]),
        recipesByService: new Map([
          ["service-1:hatch", [recipe()]],
          ["service-2:hatch", [recipe({ id: "recipe-2", serviceId: "service-2", status: "em_calibracao" })]],
        ]),
      }),
    );
    expect(result.state).toBe("parcial");
    expect(result.lines).toHaveLength(1);
    expect(result.servicesWithoutApprovedRecipe).toHaveLength(1);
  });
});

describe("computeConsumptionPreview — múltiplos produtos por serviço", () => {
  it("um único serviço com várias receitas aprovadas gera uma linha por produto/etapa", () => {
    const result = computeConsumptionPreview(
      baseInput({
        recipesByService: new Map([
          [
            "service-1:hatch",
            [recipe(), recipe({ id: "recipe-2", itemId: "item-2", processStep: "rodas", quantityPerService: 50 })],
          ],
        ]),
        itemsById: new Map([
          ["item-1", item()],
          ["item-2", item({ id: "item-2", name: "Alumax", currentQuantity: 2000 })],
        ]),
      }),
    );
    expect(result.state).toBe("pronta");
    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((l) => l.itemName).sort()).toEqual(["Alumax", "V-Floc Shampoo"]);
  });
});
