import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inventoryItems } from "@/db/schema";
import { initialCount20260710 } from "@/lib/inventory/data/initial-count-2026-07-10";

/**
 * Seed oficial dos 48 itens da contagem física de 10/07/2026 (npm run db:seed:inventory).
 *
 * Idempotente: usa o slug estável de cada item (`id` em initial-count-2026-07-10.ts) como
 * `external_id`, que é UNIQUE no banco (src/db/schema/inventory.ts). Rodar este script mais de
 * uma vez nunca duplica um item — a segunda execução em diante é um no-op para itens já
 * inseridos (ON CONFLICT DO NOTHING).
 *
 * Preserva exatamente nome, marca, quantidade, unidade, embalagem, condição, observações e data
 * da contagem. Não inventa estoque mínimo, custo, fornecedor ou consumo médio — os campos
 * correspondentes ficam null, como no arquivo de origem.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar o seed de estoque.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log(`Aplicando seed de ${initialCount20260710.length} itens de estoque...`);

  let inserted = 0;
  for (const item of initialCount20260710) {
    const result = await db
      .insert(inventoryItems)
      .values({
        name: item.name,
        originalName: item.originalName ?? null,
        brand: item.brand,
        category: item.category,
        currentQuantity: String(item.currentQuantity),
        unit: item.unit,
        packageCapacity: item.packageCapacity !== null ? String(item.packageCapacity) : null,
        packageCount: item.packageCount,
        condition: item.condition,
        minimumStock: item.minimumStock !== null ? String(item.minimumStock) : null,
        unitCost: item.unitCost !== null ? String(item.unitCost) : null,
        lastCountDate: item.lastCountDate,
        quantityStatus: item.quantityStatus ?? "confirmed",
        source: "seed:initial-count-2026-07-10",
        externalId: item.id,
        notes: item.notes,
      })
      .onConflictDoNothing({ target: inventoryItems.externalId })
      .returning({ id: inventoryItems.id });

    if (result.length > 0) inserted += 1;
  }

  console.log(`Concluído: ${inserted} itens novos inseridos, ${initialCount20260710.length - inserted} já existiam (ignorados).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de estoque:", error instanceof Error ? error.message : error);
  process.exit(1);
});
