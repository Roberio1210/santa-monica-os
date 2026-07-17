import { PageHeader } from "@/components/shared/page-header";
import { MovementsView } from "@/components/inventory/movements-view";
import { fetchAllMovementsWithItemInfo } from "@/lib/inventory/movements-view";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import type { MovementType } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

export default async function MovimentacoesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const [movements, rawItems] = await Promise.all([fetchAllMovementsWithItemInfo(), getInventoryRepository().listItems()]);
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader title="Movimentações" description="Livro-razão do estoque — toda mudança de saldo passa por aqui, nada é sobrescrito silenciosamente." />
      <MovementsView movements={movements} items={items} initialType={type as MovementType | undefined} />
    </div>
  );
}
