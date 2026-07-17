import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { RecipeRepository } from "@/lib/recipes/repository";
import { StaticRecipeRepository } from "@/lib/recipes/static-repository";
import { PostgresRecipeRepository } from "@/lib/recipes/postgres-repository";

let cached: RecipeRepository | null = null;

/** Mesma escolha automática usada em src/lib/inventory/repository-factory.ts. */
export function getRecipeRepository(): RecipeRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresRecipeRepository() : new StaticRecipeRepository();
  return cached;
}
