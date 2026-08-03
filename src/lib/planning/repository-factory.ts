import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { PlanningRepository } from "@/lib/planning/repository";
import { MemoryPlanningRepository } from "@/lib/planning/memory-repository";
import { PostgresPlanningRepository } from "@/lib/planning/postgres-repository";

let cached: PlanningRepository | null = null;

/** Postgres quando DATABASE_URL está configurada, memória (não persistente) caso contrário — mesmo padrão de `attendance/repository-factory.ts`. */
export function getPlanningRepository(): PlanningRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresPlanningRepository() : new MemoryPlanningRepository();
  return cached;
}
