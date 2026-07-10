import "server-only";
import type { InventoryRepository } from "@/lib/inventory/repository";
import type { InventoryItem, StockMovement, MovementType } from "@/lib/inventory/types";
import { initialCount20260710 } from "@/lib/inventory/data/initial-count-2026-07-10";

/**
 * Implementação em memória, baseada em dados iniciais tipados no código.
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
function applyDelta(current: number, type: MovementType, quantity: number): number {
  switch (type) {
    case "entrada":
    case "compra":
      return current + quantity;
    case "saida":
    case "perda":
    case "consumo_interno":
      return current - quantity;
    case "ajuste_inventario":
      // Para ajuste de inventário, quantity é o valor absoluto recontado, não um delta.
      return quantity;
  }
}

export class StaticInventoryRepository implements InventoryRepository {
  private items: InventoryItem[] = initialCount20260710.map((item) => ({ ...item }));
  private movements: StockMovement[] = [];
  private nextMovementId = 1;

  async listItems(): Promise<InventoryItem[]> {
    return this.items.map((item) => ({ ...item }));
  }

  async getItem(id: string): Promise<InventoryItem | null> {
    const item = this.items.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async listMovements(itemId?: string): Promise<StockMovement[]> {
    const movements = itemId ? this.movements.filter((m) => m.itemId === itemId) : this.movements;
    return movements.map((m) => ({ ...m }));
  }

  async recordMovement(movement: Omit<StockMovement, "id">): Promise<StockMovement> {
    const item = this.items.find((i) => i.id === movement.itemId);
    if (!item) throw new Error(`Item de estoque não encontrado: ${movement.itemId}`);

    item.currentQuantity = applyDelta(item.currentQuantity, movement.type, movement.quantity);

    const recorded: StockMovement = { ...movement, id: String(this.nextMovementId++) };
    this.movements.push(recorded);
    return { ...recorded };
  }
}

export const inventoryRepository: InventoryRepository = new StaticInventoryRepository();
