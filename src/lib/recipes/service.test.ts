import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addSample,
  approveRecipe,
  computeExpectedConsumption,
  createNewVersion,
  createRecipe,
  editRecipe,
  excludeSample,
  findApplicableRecipe,
  getCalibrationStatus,
  listCombinationsWithoutRecipe,
  listRecipesWithFewSamples,
  recalculateStatistics,
  suspendRecipe,
} from "@/lib/recipes/service";
import { MIN_SAMPLES_FOR_PROVISIONAL } from "@/lib/recipes/types";
import type { NewSampleInput } from "@/lib/recipes/types";

function baseSample(recipeId: string, overrides: Partial<Omit<NewSampleInput, "concentrateConsumed">> = {}) {
  return {
    recipeId,
    serviceOrderExternalId: null,
    date: "2026-07-10",
    quantityBefore: 100,
    quantityAfter: 90,
    preparedQuantity: null,
    leftoverReused: null,
    discarded: null,
    dilutionRatio: null,
    responsibleName: "Robério",
    notes: null,
    ...overrides,
  };
}

async function addValidSamples(recipeId: string, values: number[]) {
  for (const [i, v] of values.entries()) {
    await addSample(baseSample(recipeId, { quantityBefore: 100, quantityAfter: 100 - v, date: `2026-07-${10 + i}` }));
  }
}

describe("createRecipe — unicidade e separação", () => {
  it("não permite duas receitas ativas para a mesma combinação serviço+categoria+etapa+produto", async () => {
    await createRecipe({
      serviceId: "svc-unico-1",
      itemId: "item-unico-1",
      vehicleCategory: "hatch",
      processStep: "shampoo",
      unit: "ml",
      dilutionRatio: null,
      notes: null,
    });

    await expect(
      createRecipe({
        serviceId: "svc-unico-1",
        itemId: "item-unico-1",
        vehicleCategory: "hatch",
        processStep: "shampoo",
        unit: "ml",
        dilutionRatio: null,
        notes: null,
      }),
    ).rejects.toThrow(/já existe uma receita ativa/i);
  });

  it("serviços diferentes para o mesmo produto/etapa/categoria não colidem", async () => {
    const a = await createRecipe({ serviceId: "svc-sep-a", itemId: "item-sep-1", vehicleCategory: "sedan", processStep: "rodas", unit: "ml", dilutionRatio: null, notes: null });
    const b = await createRecipe({ serviceId: "svc-sep-b", itemId: "item-sep-1", vehicleCategory: "sedan", processStep: "rodas", unit: "ml", dilutionRatio: null, notes: null });
    expect(a.id).not.toBe(b.id);
  });

  it("categorias de veículo diferentes não colidem — hatch e sedan nunca se misturam", async () => {
    const hatch = await createRecipe({ serviceId: "svc-cat-1", itemId: "item-cat-1", vehicleCategory: "hatch", processStep: "cera", unit: "ml", dilutionRatio: null, notes: null });
    const suv = await createRecipe({ serviceId: "svc-cat-1", itemId: "item-cat-1", vehicleCategory: "suv", processStep: "cera", unit: "ml", dilutionRatio: null, notes: null });
    expect(hatch.id).not.toBe(suv.id);
  });

  it("toda receita nova começa em rascunho, sem mediana e sem amostras", async () => {
    const recipe = await createRecipe({ serviceId: "svc-novo-1", itemId: "item-novo-1", vehicleCategory: "caminhonete", processStep: "motor", unit: "ml", dilutionRatio: null, notes: null });
    expect(recipe.status).toBe("rascunho");
    expect(recipe.quantityPerService).toBeNull();
    expect(recipe.sampleCount).toBe(0);
  });
});

describe("addSample / calibração", () => {
  it("com menos de 5 amostras válidas, a receita é 'provisória' apenas depois da 1ª amostra (em_calibracao) mas não está pronta para aprovação", async () => {
    const recipe = await createRecipe({ serviceId: "svc-calib-1", itemId: "item-calib-1", vehicleCategory: "hatch", processStep: "vidros", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14]);

    const status = await getCalibrationStatus(recipe.id);
    expect(status.status).toBe("em_calibracao");
    expect(status.sampleCount).toBe(3);
    expect(status.isProvisional).toBe(false);
    expect(status.median).not.toBeNull();
  });

  it(`com ${MIN_SAMPLES_FOR_PROVISIONAL} amostras válidas, a receita já é elegível para aprovação manual`, async () => {
    const recipe = await createRecipe({ serviceId: "svc-calib-2", itemId: "item-calib-2", vehicleCategory: "hatch", processStep: "vidros", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]);

    const status = await getCalibrationStatus(recipe.id);
    expect(status.sampleCount).toBe(MIN_SAMPLES_FOR_PROVISIONAL);
    expect(status.isProvisional).toBe(true);
    expect(status.isApprovalReady).toBe(true);
  });

  it("10 amostras é o preferido, mas não bloqueia a aprovação com 5", async () => {
    const recipe = await createRecipe({ serviceId: "svc-calib-3", itemId: "item-calib-3", vehicleCategory: "hatch", processStep: "vidros", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]);
    const approved = await approveRecipe(recipe.id);
    expect(approved.status).toBe("aprovada");
  });

  it("aprovação falha explicitamente com menos de 5 amostras — nunca aprova automaticamente", async () => {
    const recipe = await createRecipe({ serviceId: "svc-calib-4", itemId: "item-calib-4", vehicleCategory: "hatch", processStep: "vidros", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12]);
    await expect(approveRecipe(recipe.id)).rejects.toThrow(/precisa de ao menos/i);
  });

  it("exclusão de amostra exige justificativa não vazia", async () => {
    const recipe = await createRecipe({ serviceId: "svc-excl-1", itemId: "item-excl-1", vehicleCategory: "hatch", processStep: "pneus", unit: "ml", dilutionRatio: null, notes: null });
    const sample = await addSample(baseSample(recipe.id));
    await expect(excludeSample(sample.id, "")).rejects.toThrow(/justificativa obrigatória/i);
    await expect(excludeSample(sample.id, "   ")).rejects.toThrow(/justificativa obrigatória/i);
  });

  it("amostra excluída sai do cálculo de mediana mas permanece registrada (nunca some)", async () => {
    const recipe = await createRecipe({ serviceId: "svc-excl-2", itemId: "item-excl-2", vehicleCategory: "hatch", processStep: "pneus", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]);
    const outlier = await addSample(baseSample(recipe.id, { quantityBefore: 100, quantityAfter: 0, date: "2026-07-20" })); // consumo absurdo de 100

    let status = await getCalibrationStatus(recipe.id);
    expect(status.sampleCount).toBe(6);
    expect(status.max).toBe(100);

    await excludeSample(outlier.id, "Vazamento identificado durante o teste — não reflete consumo real.");

    status = await getCalibrationStatus(recipe.id);
    expect(status.sampleCount).toBe(5);
    expect(status.max).toBe(14);
  });

  it("recalculateStatistics é idempotente — chamar de novo sem novas amostras não muda o resultado", async () => {
    const recipe = await createRecipe({ serviceId: "svc-idemp-1", itemId: "item-idemp-1", vehicleCategory: "hatch", processStep: "aspiracao", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]);

    const first = await recalculateStatistics(recipe.id);
    const second = await recalculateStatistics(recipe.id);
    expect(second).toEqual(first);
  });

  it("diluição informada na amostra é usada para calcular o concentrado, não o volume bruto preparado", async () => {
    const recipe = await createRecipe({ serviceId: "svc-dil-1", itemId: "item-dil-1", vehicleCategory: "hatch", processStep: "pre_lavagem", unit: "ml", dilutionRatio: 5, notes: null });
    const sample = await addSample(
      baseSample(recipe.id, { quantityBefore: 1000, quantityAfter: 400, preparedQuantity: 600, dilutionRatio: 5 }),
    );
    expect(sample.concentrateConsumed).toBe(100); // 600 / (1+5)
  });
});

describe("suspendRecipe / receita suspensa não é aplicável", () => {
  it("receita suspensa não aparece em findApplicableRecipe mesmo com amostras suficientes", async () => {
    const recipe = await createRecipe({ serviceId: "svc-susp-1", itemId: "item-susp-1", vehicleCategory: "hatch", processStep: "chassi", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]);
    await approveRecipe(recipe.id);
    await suspendRecipe(recipe.id);

    const applicable = await findApplicableRecipe("svc-susp-1", "hatch", "chassi", "item-susp-1");
    expect(applicable).toBeNull();
  });

  it("receita suspensa não aceita novas amostras", async () => {
    const recipe = await createRecipe({ serviceId: "svc-susp-2", itemId: "item-susp-2", vehicleCategory: "hatch", processStep: "chassi", unit: "ml", dilutionRatio: null, notes: null });
    await suspendRecipe(recipe.id);
    await expect(addSample(baseSample(recipe.id))).rejects.toThrow(/suspensa/i);
  });
});

describe("consumo esperado — nunca inventa um número", () => {
  it("sem nenhuma receita para a combinação, consumo esperado é null", async () => {
    const result = await computeExpectedConsumption("svc-inexistente", "hatch", "farois", "item-inexistente");
    expect(result).toBeNull();
  });

  it("receita existente mas não aprovada: consumo esperado indisponível", async () => {
    const recipe = await createRecipe({ serviceId: "svc-naoaprov-1", itemId: "item-naoaprov-1", vehicleCategory: "hatch", processStep: "farois", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]); // em_calibracao, ainda não aprovada
    const result = await computeExpectedConsumption("svc-naoaprov-1", "hatch", "farois", "item-naoaprov-1");
    expect(result).toBeNull();
  });

  it("receita aprovada: consumo esperado é a mediana das amostras válidas", async () => {
    const recipe = await createRecipe({ serviceId: "svc-aprov-1", itemId: "item-aprov-1", vehicleCategory: "hatch", processStep: "farois", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(recipe.id, [10, 12, 14, 11, 13]);
    await approveRecipe(recipe.id);

    const result = await computeExpectedConsumption("svc-aprov-1", "hatch", "farois", "item-aprov-1");
    expect(result).not.toBeNull();
    expect(result?.quantity).toBe(12);
    expect(result?.sampleCount).toBe(5);
  });
});

describe("createNewVersion — histórico preservado", () => {
  it("versão anterior fica inativa, nova versão começa zerada com número incrementado", async () => {
    const v1 = await createRecipe({ serviceId: "svc-ver-1", itemId: "item-ver-1", vehicleCategory: "hatch", processStep: "polimento_corte", unit: "g", dilutionRatio: null, notes: null });
    await addValidSamples(v1.id, [10, 12, 14, 11, 13]);
    await approveRecipe(v1.id);

    const v2 = await createNewVersion(v1.id);

    expect(v2.version).toBe(2);
    expect(v2.isActiveVersion).toBe(true);
    expect(v2.status).toBe("rascunho");
    expect(v2.sampleCount).toBe(0);
    expect(v2.quantityPerService).toBeNull();

    const stillFindable = await findApplicableRecipe("svc-ver-1", "hatch", "polimento_corte", "item-ver-1");
    expect(stillFindable).toBeNull(); // v2 ainda não está aprovada

    // v1 não é mais a versão ativa — createRecipe para a mesma combinação com uma 3ª versão só é possível via createNewVersion, não createRecipe direto
    await expect(
      createRecipe({ serviceId: "svc-ver-1", itemId: "item-ver-1", vehicleCategory: "hatch", processStep: "polimento_corte", unit: "g", dilutionRatio: null, notes: null }),
    ).rejects.toThrow(/já existe uma receita ativa/i);
  });
});

describe("editRecipe", () => {
  it("edita notas e diluição sem afetar a identidade da receita", async () => {
    const recipe = await createRecipe({ serviceId: "svc-edit-1", itemId: "item-edit-1", vehicleCategory: "hatch", processStep: "higienizacao", unit: "ml", dilutionRatio: null, notes: null });
    const edited = await editRecipe(recipe.id, { notes: "Testar com bico spray fino.", dilutionRatio: 10 });
    expect(edited.notes).toBe("Testar com bico spray fino.");
    expect(edited.dilutionRatio).toBe(10);
    expect(edited.serviceId).toBe(recipe.serviceId);
  });
});

describe("listCombinationsWithoutRecipe / listRecipesWithFewSamples", () => {
  it("lista só as combinações informadas que ainda não têm receita — nunca inventa o produto cartesiano completo", async () => {
    await createRecipe({ serviceId: "svc-list-1", itemId: "item-list-1", vehicleCategory: "hatch", processStep: "cristalizacao", unit: "ml", dilutionRatio: null, notes: null });

    const missing = await listCombinationsWithoutRecipe([
      { serviceId: "svc-list-1", vehicleCategory: "hatch", processStep: "cristalizacao", itemId: "item-list-1" },
      { serviceId: "svc-list-2", vehicleCategory: "hatch", processStep: "cristalizacao", itemId: "item-list-2" },
    ]);

    expect(missing).toHaveLength(1);
    expect(missing[0].serviceId).toBe("svc-list-2");
  });

  it("lista receitas ativas com poucas amostras, excluindo as suspensas", async () => {
    const few = await createRecipe({ serviceId: "svc-few-1", itemId: "item-few-1", vehicleCategory: "hatch", processStep: "revisao_final", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(few.id, [10, 12]);

    const suspended = await createRecipe({ serviceId: "svc-few-2", itemId: "item-few-2", vehicleCategory: "hatch", processStep: "revisao_final", unit: "ml", dilutionRatio: null, notes: null });
    await addValidSamples(suspended.id, [10]);
    await suspendRecipe(suspended.id);

    const result = await listRecipesWithFewSamples();
    const ids = result.map((r) => r.id);
    expect(ids).toContain(few.id);
    expect(ids).not.toContain(suspended.id);
  });
});

describe("nenhuma baixa automática de estoque nesta fase", () => {
  it("service.ts do motor de receitas nunca chama recordMovement do estoque", () => {
    const source = readFileSync(path.resolve(__dirname, "service.ts"), "utf-8");
    expect(source).not.toContain("recordMovement");
    expect(source).not.toContain("getInventoryRepository");
  });
});
