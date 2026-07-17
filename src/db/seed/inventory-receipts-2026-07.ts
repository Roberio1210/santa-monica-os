import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { inventoryItems, inventoryMovements } from "@/db/schema";
import { receiptNewItems2026_07, receiptRestocks2026_07 } from "@/lib/inventory/data/receipts-2026-07";

/**
 * Importa as entradas de compra de 15, 16 e 17/07/2026 (npm run db:seed:inventory-receipts-2026-07).
 * Produtos novos viram item + movimentação "compra"; restocks de produtos já cadastrados viram
 * só uma movimentação "compra" sobre o item existente, atualizando `current_quantity`.
 *
 * Idempotente: item novo usa `external_id` único (ON CONFLICT DO NOTHING); toda movimentação
 * usa um `external_id` próprio de movimentação (também único) — rodar de novo nunca duplica
 * item nem movimentação, e nunca soma a mesma entrada duas vezes no saldo.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  let itemsInserted = 0;
  let movementsInserted = 0;

  for (const entry of receiptNewItems2026_07) {
    const [item] = await db
      .insert(inventoryItems)
      .values({
        name: entry.name,
        originalName: entry.originalName ?? null,
        brand: entry.brand,
        category: entry.category,
        currentQuantity: String(entry.currentQuantity),
        unit: entry.unit,
        packageCapacity: entry.packageCapacity !== null ? String(entry.packageCapacity) : null,
        packageCount: entry.packageCount,
        condition: entry.condition,
        minimumStock: entry.minimumStock !== null ? String(entry.minimumStock) : null,
        unitCost: entry.unitCost !== null ? String(entry.unitCost) : null,
        lastCountDate: entry.lastCountDate,
        quantityStatus: entry.quantityStatus ?? "confirmed",
        source: `seed:receipt-${entry.reference.toLowerCase()}`,
        externalId: entry.id,
        notes: entry.notes,
      })
      .onConflictDoNothing({ target: inventoryItems.externalId })
      .returning({ id: inventoryItems.id });

    if (item) itemsInserted += 1;

    // Sempre resolve o id atual (recém-inserido ou já existente de execução anterior).
    const [current] = item
      ? [item]
      : await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.externalId, entry.id)).limit(1);
    if (!current) continue;

    const movementResult = await db
      .insert(inventoryMovements)
      .values({
        itemId: current.id,
        type: "compra",
        quantity: String(entry.currentQuantity),
        unit: entry.unit,
        date: entry.lastCountDate,
        reference: entry.reference,
        previousBalance: "0",
        newBalance: String(entry.currentQuantity),
        source: `seed:receipt-${entry.reference.toLowerCase()}`,
        externalId: `${entry.reference.toLowerCase()}:${entry.id}`,
        notes: null,
      })
      .onConflictDoNothing({ target: inventoryMovements.externalId })
      .returning({ id: inventoryMovements.id });

    if (movementResult.length > 0) movementsInserted += 1;
  }

  for (const restock of receiptRestocks2026_07) {
    const movementExternalId = `${restock.reference.toLowerCase()}:${restock.itemExternalId}`;
    const [existingMovement] = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.externalId, movementExternalId))
      .limit(1);
    if (existingMovement) continue; // já aplicado — nunca soma a mesma entrada duas vezes

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.externalId, restock.itemExternalId)).limit(1);
    if (!item) {
      console.error(`Item não encontrado para restock: ${restock.itemExternalId}`);
      continue;
    }

    const previousBalance = Number(item.currentQuantity);
    const newBalance = previousBalance + restock.quantity;

    await db.transaction(async (tx) => {
      await tx.update(inventoryItems).set({ currentQuantity: String(newBalance), updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
      await tx.insert(inventoryMovements).values({
        itemId: item.id,
        type: "compra",
        quantity: String(restock.quantity),
        unit: restock.unit,
        date: restock.date,
        reference: restock.reference,
        previousBalance: String(previousBalance),
        newBalance: String(newBalance),
        source: `seed:receipt-${restock.reference.toLowerCase()}`,
        externalId: movementExternalId,
        notes: restock.note,
      });
    });

    movementsInserted += 1;
  }

  console.log(`Concluído: ${itemsInserted} item(ns) novo(s), ${movementsInserted} movimentação(ões) de compra criada(s).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao importar recebimentos de julho/2026:", error instanceof Error ? error.message : error);
  process.exit(1);
});
