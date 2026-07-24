import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { organizationalBeliefs } from "@/db/schema";
import { SEED_BELIEFS } from "@/lib/zezinho/directors/organizationalMemory/beliefs";

/**
 * Crenças da empresa (Sprint 5.0, Z3B, decisão do usuário) — os 4 exemplos dados literalmente
 * pelo usuário + os princípios não-negociáveis já documentados no contexto do cliente (CLAUDE.md).
 * `SEED_BELIEFS` vem de `organizationalMemory/beliefs.ts` para não duplicar a lista entre o seed e
 * o código de produção. Idempotente via `statement` único (npm run db:seed:organizational-beliefs).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  let inserted = 0;
  for (const belief of SEED_BELIEFS) {
    const result = await db
      .insert(organizationalBeliefs)
      .values({ statement: belief.statement, category: belief.category, source: belief.source })
      .onConflictDoNothing({ target: organizationalBeliefs.statement })
      .returning({ id: organizationalBeliefs.id });

    if (result.length > 0) inserted += 1;
  }

  console.log(`Concluído: ${inserted} crença(s) nova(s), ${SEED_BELIEFS.length - inserted} já existia(m).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de crenças:", error instanceof Error ? error.message : error);
  process.exit(1);
});
