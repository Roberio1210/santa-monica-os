import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { EmergencyRepository } from "@/lib/emergency/repository";
import { MemoryEmergencyRepository } from "@/lib/emergency/memory-repository";
import { PostgresEmergencyRepository } from "@/lib/emergency/postgres-repository";

let cached: EmergencyRepository | null = null;

/** Postgres quando há banco configurado, memória (não persistente, já com o conteúdo do seed) caso contrário — mesmo padrão de `planning/repository-factory.ts`. */
export function getEmergencyRepository(): EmergencyRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresEmergencyRepository() : new MemoryEmergencyRepository();
  return cached;
}

/** Só para testes — descarta a instância em memória para cada teste começar do seed. */
export function resetEmergencyRepositoryForTests(): void {
  cached = null;
}
