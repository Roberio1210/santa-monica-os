import { PageHeader } from "@/components/shared/page-header";
import { ExitForm } from "@/components/inventory/exit-form";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";

export const dynamic = "force-dynamic";

export default async function SaidasPage() {
  const rawItems = await getInventoryRepository().listItems();
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader title="Saídas" description="Baixa manual por motivo — consumo, perda, descarte, teste ou outros." />
      <ExitForm items={items} />
    </div>
  );
}
