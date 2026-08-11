import { describe, expect, it } from "vitest";
import { classifyOrderForAutomaticConsumption } from "@/lib/jumppark-orders/automatic-consumption";
import type { ConsumptionPreview, PreviewLine } from "@/lib/jumppark-orders/preview";

function line(overrides: Partial<PreviewLine> = {}): PreviewLine {
  return {
    serviceLineDescription: "Lavação Bronze - Hatch",
    canonicalServiceId: "bronze",
    canonicalServiceName: "Bronze",
    processStep: "shampoo",
    itemId: "v-floc",
    itemName: "V-Floc Shampoo",
    recipeId: "recipe-1",
    recipeVersion: 1,
    expectedQuantity: 10,
    unit: "ml",
    currentBalance: 5000,
    projectedBalance: 4990,
    hasSufficientBalance: true,
    knownCost: 0.5,
    ...overrides,
  };
}

function preview(overrides: Partial<ConsumptionPreview> = {}): ConsumptionPreview {
  return {
    externalId: "order-1",
    vehicleCategory: "hatch",
    state: "pronta",
    lines: [line()],
    unmappedServices: [],
    servicesWithoutApprovedRecipe: [],
    itemsWithoutProduct: [],
    itemsWithInsufficientBalance: [],
    unitMismatches: [],
    alreadyConsumed: false,
    blockingReasons: [],
    knownCostTotal: 5,
    costIncomplete: false,
    ...overrides,
  };
}

describe("classifyOrderForAutomaticConsumption — Automação JumpPark → Consumo, seção 8/15", () => {
  it("Bronze consome a receita correta quando a prévia está pronta", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan" }));
    expect(result.action).toBe("consumir");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].confirmedQuantity).toBe(10);
  });

  it("Silver consome a mesma receita da mesma etapa, sem inflar quantidade", () => {
    const bronze = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [line({ canonicalServiceName: "Bronze" })] }));
    const silver = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [line({ canonicalServiceName: "Silver" })] }));
    expect(silver.lines[0].confirmedQuantity).toBe(bronze.lines[0].confirmedQuantity);
  });

  it("Gold consome a mesma quantidade nas etapas compartilhadas e só adiciona a etapa extra real", () => {
    const sharedLine = line({ canonicalServiceName: "Gold", processStep: "shampoo", itemId: "v-floc", expectedQuantity: 10 });
    const extraLine = line({ canonicalServiceName: "Gold", processStep: "vitrificacao", itemId: "sio2-pro", expectedQuantity: 5, recipeId: "recipe-extra" });
    const gold = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [sharedLine, extraLine] }));
    const bronze = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [line({ canonicalServiceName: "Bronze", processStep: "shampoo", itemId: "v-floc", expectedQuantity: 10 })] }));

    const goldShampoo = gold.lines.find((l) => l.itemId === "v-floc");
    expect(goldShampoo?.confirmedQuantity).toBe(bronze.lines[0].confirmedQuantity);
    expect(gold.lines.find((l) => l.itemId === "sio2-pro")).toBeDefined();
    expect(gold.lines).toHaveLength(2);
  });

  it("Izer só entra no consumo quando a prévia realmente tem a linha (receita configurada) — nunca adicionado por suposição", () => {
    const goldWithoutIzer = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [line({ canonicalServiceName: "Gold" })] }));
    expect(goldWithoutIzer.lines.some((l) => l.itemId === "izer")).toBe(false);
  });

  it("mesma quantidade base de 3x1 (pré-lavagem) em Bronze/Silver/Gold do mesmo porte", () => {
    const make = (service: string) => classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [line({ canonicalServiceName: service, processStep: "pre_lavagem", itemId: "3x1", expectedQuantity: 50 })] }));
    const bronze = make("Bronze");
    const silver = make("Silver");
    const gold = make("Gold");
    expect(silver.lines[0].confirmedQuantity).toBe(bronze.lines[0].confirmedQuantity);
    expect(gold.lines[0].confirmedQuantity).toBe(bronze.lines[0].confirmedQuantity);
  });

  it("hatch vs SUV produzem consumo diferente na mesma etapa sensível à área", () => {
    const hatch = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "hatch", lines: [line({ processStep: "shampoo", expectedQuantity: 10 })] }));
    const sedan = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "sedan", lines: [line({ processStep: "shampoo", expectedQuantity: 10 })] }));
    const suv = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "suv", lines: [line({ processStep: "shampoo", expectedQuantity: 10 })] }));
    expect(suv.lines[0].confirmedQuantity).toBeGreaterThan(hatch.lines[0].confirmedQuantity);
    expect(suv.lines[0].justification).not.toBeNull();
    // Sedan é o fator neutro (1.0) — única categoria sem divergência, logo sem justificativa.
    expect(sedan.lines[0].justification).toBeNull();
  });

  it("nunca aplica multiplicador de porte a etapas de quantidade fixa (pneus)", () => {
    const hatch = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "hatch", lines: [line({ processStep: "pneus", expectedQuantity: 100 })] }));
    const caminhonete = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "caminhonete", lines: [line({ processStep: "pneus", expectedQuantity: 100 })] }));
    expect(hatch.lines[0].confirmedQuantity).toBe(100);
    expect(caminhonete.lines[0].confirmedQuantity).toBe(100);
  });

  it("ordem já consumida (sincronizada duas vezes) nunca consome de novo — idempotência", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ alreadyConsumed: true }));
    expect(result.action).toBe("pular");
    expect(result.skipReason).toBe("ja_consumida");
    expect(result.lines).toHaveLength(0);
  });

  it("ordem com serviço não mapeado nunca consome sozinha", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ unmappedServices: [{ serviceLineDescription: "Serviço Desconhecido" }] }));
    expect(result.action).toBe("pular");
    expect(result.skipReason).toBe("servico_nao_mapeado");
  });

  it("receita não configurada (nenhuma linha aprovada) nunca consome sozinha", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ lines: [], state: "bloqueada" }));
    expect(result.action).toBe("pular");
    expect(result.skipReason).toBe("sem_receita_aprovada");
  });

  it("categoria de veículo desconhecida nunca consome sozinha, mesmo com receita aprovada", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ vehicleCategory: "desconhecido" }));
    expect(result.action).toBe("pular");
    expect(result.skipReason).toBe("categoria_veiculo_desconhecida");
  });

  it("prévia parcial (só parte dos serviços resolvível) fica para revisão humana, nunca decide sozinha", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ state: "parcial" }));
    expect(result.action).toBe("pular");
    expect(result.skipReason).toBe("parcial_requer_revisao_humana");
  });

  it("produto sem custo cadastrado não impede o consumo — só o custo total fica incompleto (nunca bloqueia baixa de estoque)", () => {
    const result = classifyOrderForAutomaticConsumption(preview({ lines: [line({ knownCost: null })], knownCostTotal: null, costIncomplete: true }));
    expect(result.action).toBe("consumir");
  });
});
