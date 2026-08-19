import "server-only";
import type { InventoryRepository } from "@/lib/inventory/repository";
import type { InventoryItem, StockMovement } from "@/lib/inventory/types";
import { initialCount20260710 } from "@/lib/inventory/data/initial-count-2026-07-10";
import { applyMovementDelta } from "@/lib/inventory/movement-math";

/**
 * Implementação em memória, baseada em dados iniciais tipados no código. Usada automaticamente
 * quando DATABASE_URL não está configurada (ver src/lib/inventory/repository-factory.ts).
 *
 * LIMITAÇÃO CRÍTICA: em ambiente serverless (Vercel), cada invocação/cold start pode rodar em
 * um processo isolado, sem memória compartilhada. Isso significa que qualquer movimentação
 * registrada aqui NÃO é garantida persistir entre requisições em produção — os dados podem
 * "voltar ao estado inicial" a qualquer momento. Por isso, a interface de movimentação manual
 * (`recordMovement`) existe e está implementada, mas a ação de submissão na UI permanece
 * desabilitada (ver src/app/estoque/page.tsx) até que: (a) um banco de dados real esteja
 * configurado, e (b) exista autenticação para proteger a ação de alteração.
 *
 * Ver docs/inventory-module.md para o caminho de migração recomendado.
 */
export class StaticInventoryRepository implements InventoryRepository {
  private items: InventoryItem[] = initialCount20260710.map((item) => ({
    ...item,
    originalName: item.originalName ?? null,
    quantityStatus: item.quantityStatus ?? "confirmed",
    supplier: null,
    location: null,
    idealStock: null,
    classification: null,
    canonicalItemId: null,
    consolidatedAt: null,
  }));
  private movements: StockMovement[] = [];
  private nextMovementId = 1;

  async listItems(): Promise<InventoryItem[]> {
    return this.items.filter((item) => item.active !== false).map((item) => ({ ...item }));
  }

  async listInactiveItems(): Promise<InventoryItem[]> {
    return this.items.filter((item) => item.active === false).map((item) => ({ ...item }));
  }

  async getItem(id: string): Promise<InventoryItem | null> {
    const item = this.items.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async listMovements(itemId?: string): Promise<StockMovement[]> {
    const movements = itemId ? this.movements.filter((m) => m.itemId === itemId) : this.movements;
    return movements.map((m) => ({ ...m }));
  }

  async recordMovement(movement: Omit<StockMovement, "id" | "previousBalance" | "newBalance">): Promise<StockMovement> {
    if (movement.externalId) {
      const existing = this.movements.find((m) => m.externalId === movement.externalId);
      if (existing) return { ...existing };
    }

    const item = this.items.find((i) => i.id === movement.itemId);
    if (!item) throw new Error(`Item de estoque não encontrado: ${movement.itemId}`);

    const previousBalance = item.currentQuantity;
    const newBalance = applyMovementDelta(previousBalance, movement.type, movement.quantity);
    item.currentQuantity = newBalance;

    const recorded: StockMovement = { ...movement, id: String(this.nextMovementId++), previousBalance, newBalance };
    this.movements.push(recorded);
    return { ...recorded };
  }

  /** Missão de Consolidação da Contagem de Estoque V1 — equivalente em memória de `recordPhysicalCount`; mutações sequenciais já são atômicas de fato (single-thread), sem necessidade de transação explícita aqui. */
  async recordPhysicalCount(input: { itemId: string; countedQuantity: number; date: string; responsible: string; reference: string | null; notes: string | null }): Promise<StockMovement> {
    const item = this.items.find((i) => i.id === input.itemId);
    if (!item) throw new Error(`Item de estoque não encontrado: ${input.itemId}`);

    const previousBalance = item.currentQuantity;
    const newBalance = applyMovementDelta(previousBalance, "correcao_inventario", input.countedQuantity);

    const recorded: StockMovement = {
      id: String(this.nextMovementId++),
      itemId: input.itemId,
      type: "correcao_inventario",
      quantity: input.countedQuantity,
      unit: item.unit,
      date: input.date,
      notes: input.notes,
      responsible: input.responsible,
      reference: input.reference,
      supplier: null,
      unitPricePaid: null,
      externalId: null,
      previousBalance,
      newBalance,
    };
    this.movements.push(recorded);

    item.currentQuantity = newBalance;
    item.lastCountDate = input.date;
    item.quantityStatus = "confirmed";

    return { ...recorded };
  }

  async updateItemDetails(
    id: string,
    patch: Partial<
      Pick<
        InventoryItem,
        | "supplier"
        | "location"
        | "minimumStock"
        | "idealStock"
        | "unitCost"
        | "classification"
        | "canonicalItemId"
        | "consolidatedAt"
        | "name"
        | "brand"
        | "category"
        | "lastCountDate"
        | "quantityStatus"
        | "packageCapacity"
        | "packageCount"
      >
    >,
  ): Promise<InventoryItem> {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error(`Item de estoque não encontrado: ${id}`);
    Object.assign(item, patch);
    return { ...item };
  }

  async setItemActive(id: string, active: boolean): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error(`Item de estoque não encontrado: ${id}`);
    item.active = active;
  }
}
