import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { OrganizationalMemoryRepository } from "@/lib/zezinho/directors/organizationalMemory/repository";
import { StaticOrganizationalMemoryRepository } from "@/lib/zezinho/directors/organizationalMemory/static-repository";
import { PostgresOrganizationalMemoryRepository } from "@/lib/zezinho/directors/organizationalMemory/postgres-repository";

let cached: OrganizationalMemoryRepository | null = null;

/** Mesma escolha automática usada em `src/lib/recipes/repository-factory.ts`. */
export function getOrganizationalMemoryRepository(): OrganizationalMemoryRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresOrganizationalMemoryRepository() : new StaticOrganizationalMemoryRepository();
  return cached;
}
