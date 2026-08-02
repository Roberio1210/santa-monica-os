import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { ManagerAssistantRepository } from "@/lib/manager-assistant/repository";
import { MemoryManagerAssistantRepository } from "@/lib/manager-assistant/memory-repository";
import { PostgresManagerAssistantRepository } from "@/lib/manager-assistant/postgres-repository";

let cached: ManagerAssistantRepository | null = null;

/** Postgres quando DATABASE_URL está configurada, memória (não persistente) caso contrário — mesmo padrão de `attendance/repository-factory.ts`. */
export function getManagerAssistantRepository(): ManagerAssistantRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresManagerAssistantRepository() : new MemoryManagerAssistantRepository();
  return cached;
}
