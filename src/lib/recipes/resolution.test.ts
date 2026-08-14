import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRecipe, declareOperationalStep } from "@/lib/recipes/resolution";
import { createRecipe, findApplicableRecipe, computeExpectedConsumption } from "@/lib/recipes/service";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";

describe("resolveRecipe — mecanismo de resolução em 3 passos (Missão do Protocolo Operacional V1)", () => {
  it("receita específica tem prioridade sobre receita compartilhada", async () => {
    const repo = getRecipeRepository();
    await declareOperationalStep("svc-res-1", "cristalizacao");

    const specific = await createRecipe({ serviceId: "svc-res-1", itemId: "item-res-1", vehicleCategory: "hatch", processStep: "cristalizacao", unit: "ml", dilutionRatio: null, notes: null });
    const shared = await repo.createSharedRecipe({ itemId: "item-res-1", vehicleCategory: "hatch", processStep: "cristalizacao", unit: "ml" });

    const result = await resolveRecipe("svc-res-1", "hatch", "cristalizacao", "item-res-1");
    expect(result.source).toBe("specific");
    if (result.source === "specific") {
      expect(result.recipe.id).toBe(specific.id);
      expect(result.recipe.id).not.toBe(shared.id);
    }
  });

  it("fallback encontra receita compartilhada quando não há receita específica", async () => {
    const repo = getRecipeRepository();
    await declareOperationalStep("svc-res-2", "farois");
    const shared = await repo.createSharedRecipe({ itemId: "item-res-2", vehicleCategory: "sedan", processStep: "farois", unit: "ml" });

    const result = await resolveRecipe("svc-res-2", "sedan", "farois", "item-res-2");
    expect(result.source).toBe("shared");
    if (result.source === "shared") expect(result.recipe.id).toBe(shared.id);
  });

  it("fallback nunca acontece se o serviço não declara a etapa em service_operational_steps", async () => {
    const repo = getRecipeRepository();
    // nunca chama declareOperationalStep para svc-res-3 — a etapa nunca foi declarada
    await repo.createSharedRecipe({ itemId: "item-res-3", vehicleCategory: "hatch", processStep: "motor", unit: "ml" });

    const result = await resolveRecipe("svc-res-3", "hatch", "motor", "item-res-3");
    expect(result).toEqual({ source: "none", reason: "step_not_declared_for_service" });
  });

  it("retorna none/no_match quando a etapa é declarada mas não existe nem receita específica nem compartilhada", async () => {
    await declareOperationalStep("svc-res-4", "chassi");
    const result = await resolveRecipe("svc-res-4", "hatch", "chassi", "item-res-4-inexistente");
    expect(result).toEqual({ source: "none", reason: "no_match" });
  });

  it("Bronze/Silver/Gold podem compartilhar a mesma receita quando os três declaram a mesma etapa", async () => {
    const repo = getRecipeRepository();
    await declareOperationalStep("svc-res-bronze", "pre_lavagem");
    await declareOperationalStep("svc-res-silver", "pre_lavagem");
    await declareOperationalStep("svc-res-gold", "pre_lavagem");
    const shared = await repo.createSharedRecipe({ itemId: "item-res-5", vehicleCategory: "hatch", processStep: "pre_lavagem", unit: "ml" });

    for (const serviceId of ["svc-res-bronze", "svc-res-silver", "svc-res-gold"]) {
      const result = await resolveRecipe(serviceId, "hatch", "pre_lavagem", "item-res-5");
      expect(result.source).toBe("shared");
      if (result.source === "shared") expect(result.recipe.id).toBe(shared.id);
    }
  });

  it("vidros específicos por pacote continuam distintos mesmo coexistindo com um fallback compartilhado", async () => {
    const repo = getRecipeRepository();
    await declareOperationalStep("svc-res-bronze-v", "vidros");
    await declareOperationalStep("svc-res-silver-v", "vidros");
    await declareOperationalStep("svc-res-gold-v", "vidros");

    // Silver tem receita específica com produto próprio; Bronze/Gold não têm específica, caem no fallback.
    const silverSpecific = await createRecipe({ serviceId: "svc-res-silver-v", itemId: "item-res-glass-farben", vehicleCategory: "hatch", processStep: "vidros", unit: "ml", dilutionRatio: null, notes: null });
    const shared = await repo.createSharedRecipe({ itemId: "item-res-glass-generic", vehicleCategory: "hatch", processStep: "vidros", unit: "ml" });

    const bronzeResult = await resolveRecipe("svc-res-bronze-v", "hatch", "vidros", "item-res-glass-generic");
    const silverResult = await resolveRecipe("svc-res-silver-v", "hatch", "vidros", "item-res-glass-farben");
    const goldResult = await resolveRecipe("svc-res-gold-v", "hatch", "vidros", "item-res-glass-generic");

    expect(bronzeResult).toEqual({ source: "shared", recipe: expect.objectContaining({ id: shared.id }) });
    expect(silverResult).toEqual({ source: "specific", recipe: expect.objectContaining({ id: silverSpecific.id }) });
    expect(goldResult).toEqual({ source: "shared", recipe: expect.objectContaining({ id: shared.id }) });
  });

  it("declareOperationalStep é idempotente — repetir nunca duplica nem desfaz a declaração", async () => {
    const first = await declareOperationalStep("svc-res-6", "aspiracao");
    const second = await declareOperationalStep("svc-res-6", "aspiracao");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const repo = getRecipeRepository();
    expect(await repo.serviceUsesOperationalStep("svc-res-6", "aspiracao")).toBe(true);
  });

  it("categoria de veículo é respeitada no fallback — nunca vaza entre categorias", async () => {
    const repo = getRecipeRepository();
    await declareOperationalStep("svc-res-7", "cera");
    const hatchShared = await repo.createSharedRecipe({ itemId: "item-res-7", vehicleCategory: "hatch", processStep: "cera", unit: "ml" });
    const suvShared = await repo.createSharedRecipe({ itemId: "item-res-7", vehicleCategory: "suv", processStep: "cera", unit: "ml" });

    const hatchResult = await resolveRecipe("svc-res-7", "hatch", "cera", "item-res-7");
    const suvResult = await resolveRecipe("svc-res-7", "suv", "cera", "item-res-7");
    const sedanResult = await resolveRecipe("svc-res-7", "sedan", "cera", "item-res-7");
    const caminhoneteResult = await resolveRecipe("svc-res-7", "caminhonete", "cera", "item-res-7");

    expect(hatchResult).toEqual({ source: "shared", recipe: expect.objectContaining({ id: hatchShared.id }) });
    expect(suvResult).toEqual({ source: "shared", recipe: expect.objectContaining({ id: suvShared.id }) });
    expect(sedanResult).toEqual({ source: "none", reason: "no_match" });
    expect(caminhoneteResult).toEqual({ source: "none", reason: "no_match" });
  });

  it("resolution.ts nunca importa vehicle-size-multiplier — multiplicadores continuam fora do escopo da resolução", () => {
    const source = readFileSync(path.resolve(__dirname, "resolution.ts"), "utf-8");
    expect(source).not.toContain("from \"@/lib/recipes/vehicle-size-multiplier\"");
    expect(source).not.toContain("import { getVehicleSizeMultiplier");
  });

  it("motor de consumo real (findApplicableRecipe/computeExpectedConsumption) continua idêntico — nunca enxerga receita compartilhada nem etapa não aprovada", async () => {
    const repo = getRecipeRepository();
    await declareOperationalStep("svc-res-8", "higienizacao");
    await createRecipe({ serviceId: "svc-res-8", itemId: "item-res-8", vehicleCategory: "hatch", processStep: "higienizacao", unit: "ml", dilutionRatio: null, notes: null });
    await repo.createSharedRecipe({ itemId: "item-res-8", vehicleCategory: "hatch", processStep: "higienizacao", unit: "ml" });

    // a receita específica está em rascunho (nunca aprovada nesta missão) — o motor real continua null.
    expect(await findApplicableRecipe("svc-res-8", "hatch", "higienizacao", "item-res-8")).toBeNull();
    expect(await computeExpectedConsumption("svc-res-8", "hatch", "higienizacao", "item-res-8")).toBeNull();
  });
});
