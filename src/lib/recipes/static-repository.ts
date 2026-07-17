import "server-only";
import type { RecipeRepository } from "@/lib/recipes/repository";
import type { CalibrationSample, NewRecipeInput, NewSampleInput, ProcessStep, Recipe, RecipePatch, SamplePatch, VehicleCategory } from "@/lib/recipes/types";

/**
 * Implementação em memória — usada automaticamente quando DATABASE_URL não está configurada
 * (ver repository-factory.ts). Começa vazia: nenhuma receita é inventada como dado inicial,
 * diferente do estoque (que tem a contagem física real como seed).
 *
 * Mesma limitação de src/lib/inventory/static-repository.ts: sem garantia de persistência
 * entre requisições em ambiente serverless.
 */
export class StaticRecipeRepository implements RecipeRepository {
  private recipes: Recipe[] = [];
  private samples: CalibrationSample[] = [];
  private nextRecipeId = 1;
  private nextSampleId = 1;

  async listRecipes(): Promise<Recipe[]> {
    return this.recipes.map((r) => ({ ...r }));
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const recipe = this.recipes.find((r) => r.id === id);
    return recipe ? { ...recipe } : null;
  }

  async findActiveRecipe(serviceId: string, vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<Recipe | null> {
    const recipe = this.recipes.find(
      (r) => r.isActiveVersion && r.serviceId === serviceId && r.vehicleCategory === vehicleCategory && r.processStep === processStep && r.itemId === itemId,
    );
    return recipe ? { ...recipe } : null;
  }

  async createRecipe(input: NewRecipeInput): Promise<Recipe> {
    const recipe: Recipe = {
      id: String(this.nextRecipeId++),
      serviceId: input.serviceId,
      itemId: input.itemId,
      vehicleCategory: input.vehicleCategory,
      processStep: input.processStep,
      quantityPerService: null,
      unit: input.unit,
      status: "rascunho",
      version: 1,
      isActiveVersion: true,
      dilutionRatio: input.dilutionRatio,
      minObserved: null,
      maxObserved: null,
      sampleCount: 0,
      lastCalibratedAt: null,
      notes: input.notes,
    };
    this.recipes.push(recipe);
    return { ...recipe };
  }

  async updateRecipe(id: string, patch: RecipePatch): Promise<Recipe> {
    const recipe = this.recipes.find((r) => r.id === id);
    if (!recipe) throw new Error(`Receita não encontrada: ${id}`);
    Object.assign(recipe, patch);
    return { ...recipe };
  }

  async listSamples(recipeId: string): Promise<CalibrationSample[]> {
    return this.samples.filter((s) => s.recipeId === recipeId).map((s) => ({ ...s }));
  }

  async addSample(input: NewSampleInput): Promise<CalibrationSample> {
    const sample: CalibrationSample = {
      id: String(this.nextSampleId++),
      ...input,
      status: "valida",
      exclusionReason: null,
    };
    this.samples.push(sample);
    return { ...sample };
  }

  async updateSample(id: string, patch: SamplePatch): Promise<CalibrationSample> {
    const sample = this.samples.find((s) => s.id === id);
    if (!sample) throw new Error(`Amostra não encontrada: ${id}`);
    Object.assign(sample, patch);
    return { ...sample };
  }
}
