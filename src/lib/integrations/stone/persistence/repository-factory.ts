import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { StonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository";
import { StoneMemoryRepository } from "@/lib/integrations/stone/persistence/memory-repository";
import { StonePostgresRepository } from "@/lib/integrations/stone/persistence/postgres-repository";

let cached: StonePersistenceRepository | null = null;

/** Mesmo padrão de `finance/repository-factory.ts`: Postgres quando `DATABASE_URL` está configurada, memória caso contrário. */
export function getStonePersistenceRepository(): StonePersistenceRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new StonePostgresRepository() : new StoneMemoryRepository();
  return cached;
}

/** Só para testes — força a próxima chamada a criar uma instância nova (limpa o estado em memória). */
export function resetStonePersistenceRepositoryForTests(): void {
  cached = null;
}
