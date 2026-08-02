import "server-only";
import { getStorageMode } from "@/lib/storage/mode";
import type { AttendanceRepository } from "@/lib/attendance/repository";
import { MemoryAttendanceRepository } from "@/lib/attendance/memory-repository";
import { PostgresAttendanceRepository } from "@/lib/attendance/postgres-repository";

let cached: AttendanceRepository | null = null;

/**
 * Escolha automática e segura: Postgres quando DATABASE_URL está configurada, memória (não
 * persistente) caso contrário — mesmo padrão de `finance/repository-factory.ts` e
 * `inventory/repository-factory.ts`.
 */
export function getAttendanceRepository(): AttendanceRepository {
  if (cached) return cached;
  cached = getStorageMode() === "postgres" ? new PostgresAttendanceRepository() : new MemoryAttendanceRepository();
  return cached;
}
