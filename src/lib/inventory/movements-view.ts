import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { StockMovement } from "@/lib/inventory/types";

export interface MovementView extends StockMovement {
  itemName: string;
  itemBrand: string;
  itemCategory: string;
}

/** Todas as movimentações já registradas, com nome/marca do produto para exibição — nenhuma consulta nova ao JumpPark. */
export async function fetchAllMovementsWithItemInfo(): Promise<MovementView[]> {
  const repo = getInventoryRepository();
  const [items, movements] = await Promise.all([repo.listItems(), repo.listMovements()]);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  return movements
    .map((m) => {
      const item = itemMap.get(m.itemId);
      return { ...m, itemName: item?.name ?? "Produto não encontrado", itemBrand: item?.brand ?? "", itemCategory: item?.category ?? "" };
    })
    .sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
}
