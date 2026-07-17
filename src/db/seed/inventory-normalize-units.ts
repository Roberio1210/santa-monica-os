import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { inventoryItems } from "@/db/schema";

/**
 * Converte itens já gravados em litros/quilos para a unidade-base padronizada do módulo
 * (mililitros/gramas — SPRINT ESTOQUE INTELIGENTE 2.0, seção "Unidades e conversões"). Nunca
 * converte peso em volume nem volume em peso — só multiplica por 1000 dentro da mesma grandeza.
 *
 * Idempotente: só atualiza linhas cujo `unit` ainda seja "L" ou "kg"; rodar de novo depois da
 * primeira execução é sempre um no-op (npm run db:seed:inventory-normalize).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const rows = await db.select().from(inventoryItems);
  let updated = 0;

  for (const row of rows) {
    if (row.unit !== "L" && row.unit !== "kg") continue;

    const newUnit = row.unit === "L" ? "ml" : "g";
    const newQuantity = Number(row.currentQuantity) * 1000;
    const newPackageCapacity = row.packageCapacity !== null ? Number(row.packageCapacity) * 1000 : null;

    await db
      .update(inventoryItems)
      .set({
        unit: newUnit,
        currentQuantity: String(newQuantity),
        packageCapacity: newPackageCapacity !== null ? String(newPackageCapacity) : null,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, row.id));

    updated += 1;
  }

  console.log(`Concluído: ${updated} item(ns) convertido(s) de L/kg para ml/g, ${rows.length - updated} já estavam na unidade-base.`);

  // Itens cujo conteúdo real da embalagem nunca foi medido (contagem de 10/07/2026) — nunca inventar o valor.
  const pendingMeasurementIds = ["hard-cleaner-wax-xtreme-expert", "composto-polidor-extra-forte-corte-farben"];
  let flagged = 0;
  for (const externalId of pendingMeasurementIds) {
    const result = await db
      .update(inventoryItems)
      .set({ quantityStatus: "measurement_pending", updatedAt: new Date() })
      .where(eq(inventoryItems.externalId, externalId))
      .returning({ id: inventoryItems.id });
    if (result.length > 0) flagged += 1;
  }
  console.log(`Concluído: ${flagged} item(ns) sinalizado(s) como quantidade pendente de medição.`);

  await client.end();
}

main().catch((error) => {
  console.error("Falha ao normalizar unidades de estoque:", error instanceof Error ? error.message : error);
  process.exit(1);
});
