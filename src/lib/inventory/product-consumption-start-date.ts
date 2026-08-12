import "server-only";
import { min } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryMovements } from "@/db/schema";
import { DATA_INICIO_HISTORICO_ESTOQUE } from "@/lib/config/historical-source-precedence";

/**
 * DATA_INICIO_CONSUMO_PRODUTO = MAX(DATA_INICIO_HISTORICO_ESTOQUE, primeira evidência real do
 * produto) — Missão do Marco Confiável do Histórico de Estoque. Nunca usa a data de criação do
 * cadastro (`inventory_items.created_at`) como evidência: só movimentações reais (compra,
 * entrada, contagem física inicial, qualquer tipo) contam como prova de disponibilidade.
 */
export function computeProductConsumptionStartDate(earliestRealMovementDate: string | null): string | null {
  if (earliestRealMovementDate === null) return null; // nenhuma evidência real — produto nunca gera consumo
  return earliestRealMovementDate > DATA_INICIO_HISTORICO_ESTOQUE ? earliestRealMovementDate : DATA_INICIO_HISTORICO_ESTOQUE;
}

/**
 * Versão em lote (eficiente para o motor de recálculo, que precisa disso para todos os itens de
 * uma vez) — consulta `MIN(date)` real por item em `inventory_movements`. Retorna `null` para um
 * item quando ele não tem nenhuma movimentação real ainda (nunca inventa uma data).
 */
export async function fetchProductConsumptionStartDates(): Promise<Map<string, string | null>> {
  const db = getDb();
  if (!db) return new Map();

  const rows = await db.select({ itemId: inventoryMovements.itemId, earliest: min(inventoryMovements.date) }).from(inventoryMovements).groupBy(inventoryMovements.itemId);

  const result = new Map<string, string | null>();
  for (const row of rows) {
    result.set(row.itemId, computeProductConsumptionStartDate(row.earliest));
  }
  return result;
}
