import { PageHeader } from "@/components/shared/page-header";
import { StocktakeView } from "@/components/inventory/stocktake-view";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { generateStocktakeReference } from "@/lib/inventory/stocktake";
import { toItemView } from "@/lib/inventory/status";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  const rawItems = await getInventoryRepository().listItems();
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const reference = generateStocktakeReference();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contagem física"
        description="Compare o saldo teórico com a contagem física real. Cada divergência confirmada vira uma movimentação de correção — o saldo nunca é sobrescrito diretamente."
      />
      <StocktakeView items={items} reference={reference} />
    </div>
  );
}
