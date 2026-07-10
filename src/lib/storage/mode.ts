import "server-only";
import { isDatabaseConfigured } from "@/db/client";

export type StorageMode = "postgres" | "memory";

/**
 * Escolha automática e segura: usa Postgres somente quando DATABASE_URL está configurada,
 * caso contrário cai para armazenamento em memória (não persistente). Nunca lança erro.
 */
export function getStorageMode(): StorageMode {
  return isDatabaseConfigured() ? "postgres" : "memory";
}
