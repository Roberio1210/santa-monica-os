import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Nunca conecta no momento do import — só na primeira chamada de getDb(). Isso é o que permite
 * o projeto compilar e ser publicado na Vercel sem DATABASE_URL configurada: nenhuma página ou
 * rota que não precise de banco jamais chama getDb(), então o processo de build nunca tenta
 * abrir uma conexão.
 */
let cached: Database | null | undefined;

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Retorna null quando DATABASE_URL não está configurada — o chamador decide o fallback. */
export function getDb(): Database | null {
  if (cached !== undefined) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    cached = null;
    return cached;
  }

  const client = postgres(url, { max: 1, prepare: false });
  cached = drizzle(client, { schema });
  return cached;
}
