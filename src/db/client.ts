import "server-only";
import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type PostgresJsTransaction } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Aceita tanto a conexão base quanto uma transação em andamento (`tx` recebido dentro de
 * `db.transaction(async (tx) => {...})`). Use este tipo em qualquer função auxiliar que PODE ser
 * chamada de dentro de uma transação (ex.: os conversores `toXxx()` dos repositórios). Nunca use
 * só `Database` nesses casos: com o pool em `max: 1` (ver abaixo), uma consulta extra fora do
 * `tx` trava a transação para sempre esperando uma segunda conexão que nunca é liberada.
 */
export type DbOrTx = Database | PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/**
 * Nunca conecta no momento do import — só na primeira chamada de getDb(). Isso é o que permite
 * o projeto compilar e ser publicado na Vercel sem DATABASE_URL configurada: nenhuma página ou
 * rota que não precise de banco jamais chama getDb(), então o processo de build nunca tenta
 * abrir uma conexão.
 */
let cached: Database | null | undefined;

/**
 * Missão Emergencial de Limpeza de Contaminação de Testes (28/08/2026) — incidente real: rodar
 * `vitest` com `DATABASE_URL` de produção carregada no processo (ex.: `dotenv-cli -e .env.local`)
 * fazia qualquer módulo dual-mode (attendance/planning/finance/inventory/recipes/
 * organizationalMemory/etc.) escrever de verdade no Neon de produção — `NODE_ENV` nunca era
 * considerado. Isso contaminou clientes, veículos, agendamentos, ordens de serviço, notificações,
 * memória organizacional e parte de contas a pagar reais, ao longo de múltiplas sessões, até ser
 * auditado e limpo (ver relatório da missão).
 *
 * Correção fail-closed: em `NODE_ENV === "test"`, `DATABASE_URL` NUNCA é usada para conectar —
 * só `TEST_DATABASE_URL` (variável deliberadamente separada, nunca a de produção) autoriza um
 * Postgres real em teste. Sem ela, o resultado é sempre "não configurada" (cai em memória via
 * `getStorageMode()`), nunca uma conexão silenciosa. Fora de teste, comportamento 100%
 * preservado: só `DATABASE_URL` é considerada, exatamente como antes desta missão.
 */
function resolveConnectionUrl(): string | undefined {
  if (process.env.NODE_ENV === "test") return process.env.TEST_DATABASE_URL;
  return process.env.DATABASE_URL;
}

export function isDatabaseConfigured(): boolean {
  return !!resolveConnectionUrl();
}

/** Retorna null quando não há URL de conexão válida para o ambiente atual — o chamador decide o fallback. */
export function getDb(): Database | null {
  if (cached !== undefined) return cached;

  const url = resolveConnectionUrl();
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
