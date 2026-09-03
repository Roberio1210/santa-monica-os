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
 * só `Database` nesses casos: uma consulta que deveria participar da transação, mas usa a conexão
 * base (`this.db()`) em vez de `tx`, corrompe a atomicidade (a consulta extra roda fora da
 * transação, vendo/alterando estado que a transação ainda não confirmou ou já revertido) — e,
 * com pool pequeno, pode travar esperando uma conexão livre que só se libera quando a própria
 * transação (que está esperando essa consulta) terminar. Esse bug real já aconteceu neste projeto
 * (`toAccountsPayable`/`toAccountsReceivable`/`toCashMovement`, Missão de Instrumentação
 * Gerencial, 11/08/2026) e foi corrigido introduzindo exatamente este tipo. Guarda de regressão
 * automatizada em `src/lib/finance/postgres-repository-transaction-safety.test.ts` — auditoria
 * completa de todas as 39 transações do repositório (Missão Performance 6E, 02/09/2026) não
 * encontrou nenhuma instância ativa do padrão. Aumentar o `max` do pool (abaixo) NUNCA substitui
 * essa disciplina — só reduz a chance de o erro virar um travamento óbvio; sem `tx` correto, o bug
 * de atomicidade continua existindo, só fica mais difícil de notar.
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

  /**
   * Missão Performance 6D/6E/6F (02/09/2026) — `max` era `1` desde a criação deste arquivo
   * (10/07/2026), como escolha conservadora inicial, não como reação a um bug. Um bug real de
   * atomicidade transacional apareceu depois (ver comentário de `DbOrTx` acima) e foi corrigido
   * — não por causa do `max: 1`, mas porque o código passou a usar `tx` corretamente em todo
   * lugar. A Missão 6D mediu experimentalmente que `max: 1` serializa toda leitura concorrente
   * desta aplicação (cada consulta espera a anterior liberar a única conexão, mesmo quando o
   * código já pede paralelismo via `Promise.all`) — `fetchGlobalSituation` caiu de ~15s (max=1)
   * para ~3,5s (max=5), sem nenhum erro/timeout em nenhuma configuração testada (max=2/3/5). A
   * Missão 6E auditou as 39 transações do repositório inteiro e não encontrou nenhum uso indevido
   * de conexão fora de `tx` — ver `DbOrTx` acima e
   * `src/lib/finance/postgres-repository-transaction-safety.test.ts` para a guarda automatizada.
   * `max: 5` foi adotado por essas duas missões combinadas: ganho de performance comprovado +
   * segurança transacional comprovada. Nunca aumentar mais sem repetir essa dupla verificação.
   */
  const client = postgres(url, { max: 5, prepare: false });
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
