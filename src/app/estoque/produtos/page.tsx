import { PageHeader } from "@/components/shared/page-header";
import { ProductsView } from "@/components/inventory/products-view";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import type { InventoryStatus, QuantityStatus } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: InventoryStatus[] = ["ok", "atencao", "comprar", "sem_minimo"];
const VALID_QUANTITY_STATUS: QuantityStatus[] = ["confirmed", "measurement_pending"];

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ status?: string; quantityStatus?: string }> }) {
  const { status, quantityStatus } = await searchParams;
  const initialStatus = VALID_STATUS.find((s) => s === status);
  const initialQuantityStatus = VALID_QUANTITY_STATUS.find((s) => s === quantityStatus);

  const [rawItems, movements, recipes] = await Promise.all([
    getInventoryRepository().listItems(),
    getInventoryRepository().listMovements(),
    getRecipeRepository().listRecipes(),
  ]);

  const items = rawItems.map(toItemView);
  const itemsWithMovement = new Set(movements.map((m) => m.itemId));
  const itemsWithRecipe = new Set(recipes.filter((r) => r.isActiveVersion).map((r) => r.itemId));

  const lastMovementByItem = new Map<string, string>();
  for (const m of movements) {
    const current = lastMovementByItem.get(m.itemId);
    if (!current || m.date > current) lastMovementByItem.set(m.itemId, m.date);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos" description="Todos os itens de estoque cadastrados — saldo calculado pelo livro-razão." />
      <ProductsView
        items={items}
        itemsWithMovement={Array.from(itemsWithMovement)}
        itemsWithRecipe={Array.from(itemsWithRecipe)}
        lastMovementByItem={Object.fromEntries(lastMovementByItem)}
        initialStatus={initialStatus}
        initialQuantityStatus={initialQuantityStatus}
      />
    </div>
  );
}
