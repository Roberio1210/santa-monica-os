import { createHash } from "node:crypto";
import type { InventorySnapshotPayload } from "@/lib/inventory/types";

/**
 * Missão Estoque E4 — integridade do snapshot de estoque. Deliberadamente auto-contido: mesma
 * ideia de `src/lib/finance/dreSnapshotHash.ts` (Missão Financeiro V7/Fase C7), mas sem nenhum
 * import cruzado entre os dois módulos — "imite os princípios de segurança... sem acoplar os dois
 * módulos" (instrução explícita da missão). Duplicar estas ~20 linhas custa muito menos do que
 * criar uma dependência entre Estoque e Financeiro por causa de uma função de hash.
 *
 * Ordena recursivamente as chaves de todo objeto (nunca a ORDEM dos itens em `products[]`, que é
 * semântica — ordem real de iteração dos produtos) antes de serializar, para que o hash dependa só
 * do conteúdo, nunca da ordem de construção do objeto em memória.
 */
export const INVENTORY_SNAPSHOT_HASH_ALGORITHM = "sha256";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const sorted: Record<string, unknown> = {};
    for (const [key, val] of entries) sorted[key] = canonicalize(val);
    return sorted;
  }
  return value;
}

export function canonicalizeInventorySnapshotPayload(payload: InventorySnapshotPayload): string {
  return JSON.stringify(canonicalize(payload));
}

export function computeInventorySnapshotHash(payload: InventorySnapshotPayload): string {
  return createHash(INVENTORY_SNAPSHOT_HASH_ALGORITHM).update(canonicalizeInventorySnapshotPayload(payload), "utf8").digest("hex");
}

/** Prova que um `payload` lido do banco não foi alterado/corrompido depois do fechamento. */
export function verifyInventorySnapshotIntegrity(payload: InventorySnapshotPayload, expectedHash: string): boolean {
  return computeInventorySnapshotHash(payload) === expectedHash;
}
