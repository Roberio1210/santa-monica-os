import type { CalibrationSample, NewRecipeInput, NewSampleInput, ProcessStep, Recipe, RecipePatch, SamplePatch, SharedRecipeMatch, VehicleCategory } from "@/lib/recipes/types";
import type { InventoryUnit } from "@/lib/inventory/types";

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

  /**
   * Missão do Protocolo Operacional V1 — true quando `serviceId` declara executar `processStep`
   * em `service_operational_steps`. Usado pelo mecanismo de resolução (ver resolution.ts) antes
   * de procurar uma receita compartilhada: uma etapa que o serviço não executa nunca "herda"
   * produto de outro serviço.
   */
  serviceUsesOperationalStep(serviceId: string, processStep: ProcessStep): Promise<boolean>;
  /**
   * Declara que um serviço executa uma etapa — idempotente, repetir nunca duplica (UNIQUE real
   * no banco em serviceId+processStep). `created=false` quando a declaração já existia.
   */
  declareOperationalStep(input: { serviceId: string; processStep: ProcessStep; externalId?: string | null; notes?: string | null }): Promise<{ created: boolean }>;
  /**
   * Busca uma receita COMPARTILHADA (serviceId nulo) para categoria+etapa+produto. Nunca deve
   * ser usada como fallback cego — quem chama já validou serviceUsesOperationalStep antes.
   */
  findSharedRecipe(vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<SharedRecipeMatch | null>;
  /**
   * Cria uma receita compartilhada (serviceId nulo) — existe para simetria/testabilidade do
   * mecanismo de resolução. Nenhum script desta missão a chama para popular dados reais (as
   * receitas de vidros são específicas por serviço); fica pronta para quando uma receita
   * genuinamente compartilhada precisar ser criada.
   */
  createSharedRecipe(input: {
    itemId: string;
    vehicleCategory: VehicleCategory;
    processStep: ProcessStep;
    unit: InventoryUnit;
    quantityPerService?: number | null;
    technicalReferenceQuantity?: number | null;
    technicalReferenceSource?: string | null;
    dilutionRatio?: number | null;
  }): Promise<SharedRecipeMatch>;
}
