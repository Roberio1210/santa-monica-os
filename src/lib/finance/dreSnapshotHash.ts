import { createHash } from "node:crypto";
import type { DreReport } from "@/lib/finance/types";

/**
 * Missão Financeiro V7 (Fase C7) — integridade do snapshot congelado da DRE. O mesmo `DreReport`
 * lógico precisa sempre produzir o mesmo hash, independente da ordem acidental de inserção das
 * chaves do objeto (V8/JS não garante ordem estável entre execuções diferentes do mesmo código em
 * todos os casos — spread de objetos, JSON.parse, etc. podem reordenar). `canonicalizeDreReport`
 * ordena as chaves de todo objeto recursivamente (nunca a ORDEM dos itens dentro de um array —
 * `DreGroupTotal.items[]` tem ordem semântica vinda da consulta, não deve ser embaralhada) antes
 * de serializar, então o hash depende só do CONTEÚDO, nunca da ordem de construção do objeto.
 *
 * Algoritmo: SHA-256 sobre a string canonicalizada (UTF-8). Gravado explicitamente em
 * `dre_snapshots.hash_algorithm` para nunca depender de um valor implícito/hardcoded na leitura.
 */
export const DRE_SNAPSHOT_HASH_ALGORITHM = "sha256";

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

/** String determinística usada como entrada do hash — exposta separadamente para depuração/inspeção manual. */
export function canonicalizeDreReport(report: DreReport): string {
  return JSON.stringify(canonicalize(report));
}

export function computeDreSnapshotHash(report: DreReport): string {
  return createHash(DRE_SNAPSHOT_HASH_ALGORITHM).update(canonicalizeDreReport(report), "utf8").digest("hex");
}

/** Prova que um `reportPayload` lido do banco não foi alterado/corrompido depois do fechamento. */
export function verifyDreSnapshotIntegrity(report: DreReport, expectedHash: string): boolean {
  return computeDreSnapshotHash(report) === expectedHash;
}
