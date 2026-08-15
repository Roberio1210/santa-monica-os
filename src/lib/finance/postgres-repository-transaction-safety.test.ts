import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regressão de um bug real e reproduzido contra o Neon (Missão de Instrumentação Gerencial, e de
 * novo — em `getAccountCurrentBalance`, que este guard não cobria ainda — na Missão Financeiro
 * V2.2): `toAccountsPayable`/`toAccountsReceivable`/`toCashMovement`/`getAccountCurrentBalance`
 * faziam consultas extras via `this.db()` (a conexão base) mesmo quando chamados de dentro do
 * próprio `db.transaction()`. Com o pool em `max: 1` (ver `db/client.ts`), isso trava para
 * sempre — a transação prende a única conexão disponível e a consulta extra fica esperando uma
 * segunda conexão que nunca é liberada. Corrigido passando `tx` explicitamente a essas funções
 * dentro de toda transação.
 *
 * Não é possível testar o deadlock em si sem um Postgres real (o repositório em memória usado nos
 * testes não tem esse limite de pool) — esta é uma guarda estrutural: garante que todo bloco de
 * transação que retorna/usa uma dessas funções sempre passa `tx` explicitamente, nunca a forma
 * de 1 argumento (que cairia no padrão `this.db()`).
 *
 * Cuidado ao editar este arquivo: o detector de início de transação abaixo procura o texto
 * literal do padrão de abertura em cada linha — mesmo dentro de comentários. Um comentário em
 * `postgres-repository.ts` que cite esse padrão como exemplo (sem quebrar a sequência de
 * caracteres) confunde a contagem de profundidade e gera falso positivo nas linhas seguintes
 * (bug encontrado e corrigido na Missão Financeiro V2.2 — nunca reintroduzir).
 */
const TRANSACTION_OPEN_PATTERN = /\bdb\.transaction\(async\s*\(tx\)\s*=>/;
const WATCHED_FUNCTIONS = ["toAccountsPayable", "toAccountsReceivable", "toCashMovement", "getAccountCurrentBalance"];

describe("PostgresFinanceRepository — nunca reintroduzir o deadlock de transação (bug real corrigido)", () => {
  it(`toda chamada a ${WATCHED_FUNCTIONS.join("/")} dentro de uma transação passa 'tx' explicitamente`, () => {
    const source = readFileSync(path.resolve(__dirname, "postgres-repository.ts"), "utf-8");
    const lines = source.split("\n");

    let transactionDepth = 0;
    const violations: string[] = [];
    const watchedCallPattern = new RegExp(`this\\.(${WATCHED_FUNCTIONS.join("|")})\\(([^)]*)\\)`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (TRANSACTION_OPEN_PATTERN.test(line)) transactionDepth++;

      const call = line.match(watchedCallPattern);
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

  it("nenhuma linha de postgres-repository.ts fora de um bloco real de transação contém o padrão de abertura (evita falso positivo por comentário)", () => {
    const source = readFileSync(path.resolve(__dirname, "postgres-repository.ts"), "utf-8");
    const lines = source.split("\n");
    const falsePositiveRisk = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => TRANSACTION_OPEN_PATTERN.test(line))
      .filter(({ line }) => !/^\s*(return |await )?db\.transaction\(async \(tx\) => \{$/.test(line));

    expect(falsePositiveRisk.map((f) => `linha ${f.i + 1}: ${f.line.trim()}`)).toEqual([]);
  });
});
