import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { InventoryRepository } from "@/lib/inventory/repository";
import { StaticInventoryRepository } from "@/lib/inventory/static-repository";
import { PostgresInventoryRepository } from "@/lib/inventory/postgres-repository";

let cached: InventoryRepository | null = null;

/**
 * Escolha automática e segura: Postgres quando DATABASE_URL está configurada, memória (não
 * persistente) caso contrário. Nenhum módulo fora deste arquivo deve instanciar
 * StaticInventoryRepository/PostgresInventoryRepository diretamente.
 */
export function getInventoryRepository(): InventoryRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresInventoryRepository() : new StaticInventoryRepository();
  return cached;
}
