import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { issueFirstAccessSetupToken } from "@/lib/auth/provisioning";

/**
 * Missão 55 — script de linha de comando para emitir (ou reemitir) o link de PRIMEIRO ACESSO de
 * um usuário JÁ existente que nunca definiu senha (nunca cria usuário, nunca é um reset genérico —
 * ver `issueFirstAccessSetupToken` em `src/lib/auth/provisioning.ts`). Mesmo padrão de
 * `src/db/seed/provision-user.ts` (conexão própria via `DATABASE_URL`, nunca `getDb()`/`server-only`).
 *
 * Uso:
 *   npm run db:issue-first-access -- --email=pessoa@exemplo.com
 */

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function redactedHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(host inválido)";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de emitir um link de primeiro acesso.");
    process.exit(1);
  }

  const { email } = parseArgs(process.argv.slice(2));
  if (!email) {
    console.error("Uso: npm run db:issue-first-access -- --email=pessoa@exemplo.com");
    process.exit(1);
  }

  console.log(`Alvo: ${redactedHost(url)} (só o host — nenhuma credencial exibida)`);
  console.log(`E-mail: ${email}`);

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const result = await issueFirstAccessSetupToken(db, { email });

    switch (result.status) {
      case "issued": {
        if (result.hadPendingToken) {
          console.log("Havia um link pendente anterior — foi substituído (o antigo não funciona mais).");
        }
        console.log("Link de primeiro acesso emitido com sucesso.");
        console.log(`ID: ${result.userId} | Papel: ${result.role}`);
        console.log(`Token de definição de senha (uso único, válido até ${result.setupTokenExpiresAt.toISOString()}):`);
        console.log(result.setupToken);
        console.log("Entregue este token SOMENTE em canal privado e direto à própria pessoa — nunca em canal compartilhado.");
        break;
      }
      case "not_found": {
        console.error("Nenhum usuário ativo encontrado com este e-mail. Nada foi alterado.");
        process.exitCode = 1;
        break;
      }
      case "inactive": {
        console.error(`Usuário (id ${result.userId}) está inativo. Este fluxo não reativa contas — nada foi alterado.`);
        process.exitCode = 1;
        break;
      }
      case "already_has_password": {
        console.error(`Usuário (id ${result.userId}) já definiu senha antes — isto não é um fluxo de reset. Nada foi alterado.`);
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Falha ao emitir link de primeiro acesso:", error instanceof Error ? error.message : error);
  process.exit(1);
});
