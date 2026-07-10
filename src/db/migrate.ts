import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Script de linha de comando (`npm run db:migrate`), nunca importado pelo app em runtime.
 * Falha imediatamente e com clareza se DATABASE_URL não estiver definida — ao contrário de
 * src/db/client.ts, que precisa continuar funcionando sem banco.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar as migrations.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("Aplicando migrations em drizzle/ ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations aplicadas com sucesso.");

  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar migrations:", error instanceof Error ? error.message : error);
  process.exit(1);
});
