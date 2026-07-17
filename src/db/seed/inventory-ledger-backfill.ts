import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inventoryItems, inventoryMovements } from "@/db/schema";

/**
 * Backfill do livro-razão: cria a movimentação "contagem_fisica_inicial" que deveria ter sido
 * registrada quando cada item foi inserido pelo seed de 10/07/2026 (src/db/seed/inventory.ts),
 * antes de o livro-razão existir. Não altera `current_quantity` do item — só cria o evento que
 * explica de onde aquele saldo veio (SPRINT ESTOQUE INTELIGENTE 2.0, seção "Princípios
 * contábeis e de estoque": "o saldo deve ser calculado por movimentações").
 *
 * Rodar depois de src/db/seed/inventory-normalize-units.ts, para que a movimentação registre
 * o saldo já convertido para ml/g.
 *
 * Idempotente: usa `stocktake-2026-07-10:<external_id do item>` como external_id da
 * movimentação (UNIQUE) — rodar de novo é sempre um no-op para itens já registrados.
 */
const REFERENCE = "STOCKTAKE-2026-07-10";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const items = await db.select().from(inventoryItems);
  let inserted = 0;

  for (const item of items) {
    if (!item.externalId) continue; // sem slug estável, sem chave de idempotência confiável

    const result = await db
      .insert(inventoryMovements)
      .values({
        itemId: item.id,
        type: "contagem_fisica_inicial",
        quantity: item.currentQuantity,
        unit: item.unit,
        date: item.lastCountDate,
        reference: REFERENCE,
        previousBalance: null,
        newBalance: item.currentQuantity,
        responsible: null,
        source: "seed:stocktake-ledger-backfill",
        externalId: `stocktake-2026-07-10:${item.externalId}`,
        notes: null,
      })
      .onConflictDoNothing({ target: inventoryMovements.externalId })
      .returning({ id: inventoryMovements.id });

    if (result.length > 0) inserted += 1;
  }

  console.log(`Concluído: ${inserted} movimentação(ões) de contagem inicial criada(s), ${items.length - inserted} já existiam (ignoradas).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar backfill do livro-razão:", error instanceof Error ? error.message : error);
  process.exit(1);
});
