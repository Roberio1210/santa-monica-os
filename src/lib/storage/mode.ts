import "server-only";
import { isDatabaseConfigured } from "@/db/client";

export type StorageMode = "postgres" | "memory";

/** Nunca emite o mesmo aviso duas vezes por processo — um teste completo com centenas de arquivos não deveria imprimir isso centenas de vezes. */
let warnedOnce = false;

/**
 * Escolha automática e segura: usa Postgres somente quando há uma URL de conexão válida PARA O
 * AMBIENTE ATUAL (`getDb()`/`isDatabaseConfigured()`, em `db/client.ts`, já resolvem isso —
 * `TEST_DATABASE_URL` em teste, `DATABASE_URL` fora de teste), caso contrário cai para
 * armazenamento em memória (não persistente). Nunca lança erro.
 *
 * Missão Emergencial de Limpeza de Contaminação de Testes (28/08/2026) — camada extra de
 * visibilidade: quando estamos em teste E `DATABASE_URL` está presente mas foi deliberadamente
 * ignorada (por faltar `TEST_DATABASE_URL`), emite um aviso claro uma vez — nunca conecta
 * silenciosamente, mesmo que o resultado final (memória) seja o mesmo de antes.
 */
export function getStorageMode(): StorageMode {
  if (process.env.NODE_ENV === "test" && !process.env.TEST_DATABASE_URL && process.env.DATABASE_URL && !warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[fail-closed] NODE_ENV=test com DATABASE_URL presente, mas sem TEST_DATABASE_URL — DATABASE_URL foi ignorada de propósito (nunca conectamos a um banco não declarado para teste). Usando armazenamento em memória. Se este teste precisa de Postgres real, defina TEST_DATABASE_URL explicitamente (nunca reaproveite .env.local de produção).",
    );
  }
  return isDatabaseConfigured() ? "postgres" : "memory";
}
