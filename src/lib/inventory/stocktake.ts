import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { generateStocktakeReference, registerPhysicalInventoryCount } from "@/lib/inventory/managerial-physical-count";
import type { StockMovement } from "@/lib/inventory/types";

export { generateStocktakeReference };

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
  /**
   * Missão de Consolidação da Contagem de Estoque V1 — itens contados SEM divergência em relação
   * ao saldo do sistema ainda geram uma posição física confiável (uma contagem sem diferença
   * prova "em tal data existiam X unidades", nunca é descartada). `unchangedCount` continua
   * contando quantos desses casos ocorreram, só para informar o resumo — não significa mais
   * "nenhuma movimentação foi criada".
   */
  unchangedCount: number;
  notFoundCount: number;
  measurementPendingCount: number;
}

/**
 * Confirma uma contagem física em lote — mesmo núcleo canônico da contagem rápida individual
 * (`registerPhysicalInventoryCount`), nunca uma segunda regra de negócio para o mesmo conceito
 * (Missão de Consolidação da Contagem de Estoque V1, seção 5). Cada linha efetivamente contada
 * (com quantidade física informada) vira uma posição física confiável própria, mesmo sem
 * divergência de saldo. Bloqueia confirmação duplicada: uma `reference` só pode ser confirmada
 * uma única vez (mesma ideia dos seeds idempotentes de external_id, aplicada aqui à referência
 * da contagem) — todas as linhas de uma sessão compartilham a MESMA `reference`, preservando o
 * agrupamento usado por `deriveStocktakeSessions`.
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
    }

    const result = await registerPhysicalInventoryCount({
      itemId: line.itemId,
      countedQuantity: line.physicalQuantity,
      countedAt: today,
      source: responsible.trim(),
      notes: line.observation?.trim() || null,
      reference,
    });
    movements.push(result.movement);
  }

  return { reference, movements, unchangedCount, notFoundCount, measurementPendingCount };
}
