import { PageHeader } from "@/components/shared/page-header";
import { EntryForm } from "@/components/inventory/entry-form";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";

export const dynamic = "force-dynamic";

export default async function EntradasPage() {
  const rawItems = await getInventoryRepository().listItems();
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader title="Entradas" description="Registro manual de compras/recebimentos — atualiza saldo e custo médio automaticamente." />
      <EntryForm items={items} />
    </div>
  );
}
