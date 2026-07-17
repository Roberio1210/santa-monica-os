import type { CalibrationSample, NewRecipeInput, NewSampleInput, ProcessStep, Recipe, RecipePatch, SamplePatch, VehicleCategory } from "@/lib/recipes/types";

/**
 * Contrato de acesso a dados de receitas/calibração, desacoplado da implementação — mesma
 * forma usada em src/lib/inventory/repository.ts.
 */
export interface RecipeRepository {
  listRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | null>;
  /** Busca a versão ativa (isActiveVersion=true), de qualquer status, para a combinação exata. */
  findActiveRecipe(serviceId: string, vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<Recipe | null>;
  createRecipe(input: NewRecipeInput): Promise<Recipe>;
  updateRecipe(id: string, patch: RecipePatch): Promise<Recipe>;

  listSamples(recipeId: string): Promise<CalibrationSample[]>;
  addSample(input: NewSampleInput): Promise<CalibrationSample>;
  updateSample(id: string, patch: SamplePatch): Promise<CalibrationSample>;
}
