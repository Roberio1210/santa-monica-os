import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regressão de um bug real e reproduzido contra o Neon (Missão de Instrumentação Gerencial):
 * `toAccountsPayable`/`toAccountsReceivable`/`toCashMovement` faziam consultas extras via
 * `this.db()` (a conexão base) mesmo quando chamados de dentro do próprio `db.transaction()`.
 * Com o pool em `max: 1` (ver `db/client.ts`), isso trava para sempre — a transação prende a
 * única conexão disponível e a consulta extra fica esperando uma segunda conexão que nunca é
 * liberada. Corrigido passando `tx` explicitamente a esses conversores dentro de toda transação.
 *
 * Não é possível testar o deadlock em si sem um Postgres real (o repositório em memória usado nos
 * testes não tem esse limite de pool) — esta é uma guarda estrutural: garante que todo bloco
 * `db.transaction(async (tx) => {...})` que retorna um desses conversores sempre passa `tx`
 * explicitamente, nunca a forma de 1 argumento (que cairia no padrão `this.db()`).
 */
describe("PostgresFinanceRepository — nunca reintroduzir o deadlock de transação (bug real corrigido)", () => {
  it("toda chamada a toAccountsPayable/toAccountsReceivable/toCashMovement dentro de uma transação passa 'tx' explicitamente", () => {
    const source = readFileSync(path.resolve(__dirname, "postgres-repository.ts"), "utf-8");
    const lines = source.split("\n");

    let transactionDepth = 0;
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bdb\.transaction\(async\s*\(tx\)\s*=>/.test(line)) transactionDepth++;

      const call = line.match(/this\.(toAccountsPayable|toAccountsReceivable|toCashMovement)\(([^)]*)\)/);
      if (call && transactionDepth > 0) {
        const args = call[2];
        if (!/\btx\b/.test(args)) {
          violations.push(`linha ${i + 1}: ${line.trim()}`);
        }
      }

      // Heurística simples de fechamento: uma linha só com "});" no nível de coluna baixo fecha o transaction() mais recente.
      // Como o arquivo real sempre fecha `db.transaction(...)` com `});` alinhado ao `return`/`await` que o abriu,
      // contamos fechamentos de chaves de função de forma aproximada olhando por essa assinatura específica.
      if (transactionDepth > 0 && /^\s{4}\}\);\s*$/.test(line)) transactionDepth--;
    }

    expect(violations, `Chamadas sem 'tx' explícito dentro de uma transação (reintroduz o deadlock):\n${violations.join("\n")}`).toEqual([]);
  });
});
