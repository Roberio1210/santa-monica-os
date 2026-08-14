import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { BankStatementRepository } from "@/lib/finance/bankStatement/repository";
import { BankStatementMemoryRepository } from "@/lib/finance/bankStatement/memory-repository";
import { BankStatementPostgresRepository } from "@/lib/finance/bankStatement/postgres-repository";

let cached: BankStatementRepository | null = null;

export function getBankStatementRepository(): BankStatementRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new BankStatementPostgresRepository() : new BankStatementMemoryRepository();
  return cached;
}

/** Só para testes — força a próxima chamada a criar uma instância nova (limpa o estado em memória). */
export function resetBankStatementRepositoryForTests(): void {
  cached = null;
}
