import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { FinanceRepository } from "@/lib/finance/repository";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";
import { PostgresFinanceRepository } from "@/lib/finance/postgres-repository";

let cached: FinanceRepository | null = null;

/**
 * Escolha automática e segura: Postgres quando DATABASE_URL está configurada, memória (não
 * persistente) caso contrário — mesmo padrão de src/lib/inventory/repository-factory.ts.
 */
export function getFinanceRepository(): FinanceRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresFinanceRepository() : new StaticFinanceRepository();
  return cached;
}
