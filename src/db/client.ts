import "server-only";
import { sql } from "drizzle-orm";
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

export interface DatabasePing {
  configured: boolean;
  reachable: boolean | null;
  latencyMs: number | null;
  error: string | null;
}

/**
 * Missão de estabilização (04/08/2026) — verifica conectividade REAL com o Neon (consulta
 * mínima), não só se DATABASE_URL está definida. Usado em /admin/diagnostico. Nunca inclui a
 * connection string na mensagem de erro.
 */
export async function pingDatabase(): Promise<DatabasePing> {
  const db = getDb();
  if (!db) return { configured: isDatabaseConfigured(), reachable: null, latencyMs: null, error: null };

  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { configured: true, reachable: true, latencyMs: Date.now() - start, error: null };
  } catch (err) {
    return { configured: true, reachable: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/\S+/gi, "[connection string omitida]") : "Falha desconhecida ao consultar o banco." };
  }
}
