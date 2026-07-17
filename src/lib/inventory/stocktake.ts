import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { StockMovement } from "@/lib/inventory/types";

/** Referência única de uma sessão de contagem — gerada uma vez por carregamento da página (Server Component), nunca no cliente. */
export function generateStocktakeReference(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `CONTAGEM-${today}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface StocktakeLineInput {
  itemId: string;
  /** Null quando o item foi marcado "não encontrado" ou "medição pendente" — nunca gera movimentação nesses casos. */
  physicalQuantity: number | null;
  notFound: boolean;
  measurementPending: boolean;
  observation: string | null;
}

export interface StocktakeResult {
  reference: string;
  movements: StockMovement[];
  /** Itens contados sem divergência em relação ao saldo teórico — nenhuma movimentação foi necessária. */
  unchangedCount: number;
  notFoundCount: number;
  measurementPendingCount: number;
}

/**
 * Confirma uma contagem física em lote — nunca sobrescreve o saldo diretamente: cada divergência
 * vira uma movimentação "correcao_inventario" própria, preservando o histórico. Bloqueia
 * confirmação duplicada: uma `reference` só pode ser confirmada uma única vez (mesma ideia dos
 * seeds idempotentes de external_id, aplicada aqui à referência da contagem).
 */
export async function confirmStocktake(reference: string, responsible: string, lines: StocktakeLineInput[]): Promise<StocktakeResult> {
  if (!reference.trim()) throw new Error("Referência da contagem é obrigatória.");
  if (!responsible.trim()) throw new Error("Responsável é obrigatório.");

  const repo = getInventoryRepository();
  const existingMovements = await repo.listMovements();
  if (existingMovements.some((m) => m.reference === reference)) {
    throw new Error("Esta contagem já foi confirmada anteriormente — cada referência só pode ser confirmada uma vez.");
  }

  const items = await repo.listItems();
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const today = new Date().toISOString().slice(0, 10);

  const movements: StockMovement[] = [];
  let unchangedCount = 0;
  let notFoundCount = 0;
  let measurementPendingCount = 0;

  for (const line of lines) {
    if (line.notFound) {
      notFoundCount += 1;
      continue;
    }
    if (line.measurementPending || line.physicalQuantity === null) {
      measurementPendingCount += 1;
      continue;
    }

    const item = itemMap.get(line.itemId);
    if (!item) continue;

    if (Math.abs(item.currentQuantity - line.physicalQuantity) < 0.001) {
      unchangedCount += 1;
      continue;
    }

    const movement = await repo.recordMovement({
      itemId: line.itemId,
      type: "correcao_inventario",
      quantity: line.physicalQuantity,
      unit: item.unit,
      date: today,
      responsible: responsible.trim(),
      reference,
      notes: line.observation?.trim() || null,
    });
    movements.push(movement);
  }

  return { reference, movements, unchangedCount, notFoundCount, measurementPendingCount };
}
