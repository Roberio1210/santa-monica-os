import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { applyEmergencySeed } from "@/lib/emergency/seed";
import { SEED_CONTACTS, SEED_PROTOCOLS } from "@/lib/emergency/seed-data";

/**
 * Módulo Emergência — carga inicial da Central (`npm run db:seed:emergency`). Toda a lógica
 * (idempotente, não destrutiva, transacional) está em `src/lib/emergency/seed.ts`.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const result = await applyEmergencySeed(db);

  console.log(
    `Concluído: ${result.contactsInserted} contato(s) novo(s) (${SEED_CONTACTS.length - result.contactsInserted} já existia(m)), ` +
      `${result.protocolsInserted} protocolo(s) novo(s) (${SEED_PROTOCOLS.length - result.protocolsInserted} já existia(m)), ${result.stepsInserted} passo(s) inserido(s).`,
  );
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed da Central de Emergência:", error instanceof Error ? error.message : error);
  process.exit(1);
});
