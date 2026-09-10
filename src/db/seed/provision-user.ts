import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { provisionUser } from "@/lib/auth/provisioning";
import { userRoles, type UserRole } from "@/lib/auth/roles";

/**
 * Missão 53 — script de linha de comando para provisionar um usuário individual real (nunca
 * define senha diretamente: gera um token de uso único para a própria pessoa escolher a senha em
 * `/definir-senha`). Mesmo padrão dos demais scripts de `src/db/seed/` (conexão própria via
 * `DATABASE_URL`, nunca importa `getDb()`/`server-only`) — ver `npm run db:provision-user`.
 *
 * Uso:
 *   npm run db:provision-user -- --email=pessoa@exemplo.com --name="Nome Completo" --role=admin
 *
 * Nunca roda sozinho contra produção sem o operador saber: imprime o HOST do banco (nunca a
 * connection string completa, nunca credenciais) antes de escrever, e para com uma mensagem clara
 * se o usuário já existir — não sobrescreve nada silenciosamente.
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
    console.error("DATABASE_URL não está definida. Configure-a antes de provisionar um usuário.");
    process.exit(1);
  }

  const { email, name, role } = parseArgs(process.argv.slice(2));
  if (!email || !name || !role) {
    console.error('Uso: npm run db:provision-user -- --email=pessoa@exemplo.com --name="Nome Completo" --role=admin|operacional');
    process.exit(1);
  }

  console.log(`Alvo: ${redactedHost(url)} (só o host — nenhuma credencial exibida)`);
  console.log(`E-mail: ${email} | Nome: ${name} | Papel: ${role}`);

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const result = await provisionUser(db, { email, name, role: role as UserRole });

    switch (result.status) {
      case "created": {
        console.log("Usuário criado com sucesso.");
        console.log(`ID: ${result.userId}`);
        console.log(`Token de definição de senha (uso único, válido até ${result.setupTokenExpiresAt.toISOString()}):`);
        console.log(result.setupToken);
        console.log("Entregue este token SOMENTE em canal privado e direto à própria pessoa — nunca em canal compartilhado.");
        break;
      }
      case "already_exists": {
        console.error(`Já existe um usuário com este e-mail (id ${result.userId}, papel atual "${result.role}"). Nada foi alterado.`);
        process.exitCode = 1;
        break;
      }
      case "invalid_role": {
        console.error(`Papel inválido: "${result.role}". Papéis válidos: ${userRoles.join(", ")}.`);
        process.exitCode = 1;
        break;
      }
      case "invalid_email": {
        console.error("E-mail inválido.");
        process.exitCode = 1;
        break;
      }
      case "invalid_name": {
        console.error("Nome não pode ser vazio.");
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Falha ao provisionar usuário:", error instanceof Error ? error.message : error);
  process.exit(1);
});
