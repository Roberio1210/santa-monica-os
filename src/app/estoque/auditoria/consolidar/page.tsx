import { PageHeader } from "@/components/shared/page-header";
import { ConsolidationWizard } from "@/components/inventory/audit/consolidation-wizard";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

export const dynamic = "force-dynamic";

export default async function ConsolidarPage({ searchParams }: { searchParams: Promise<{ master?: string; merge?: string }> }) {
  const { master, merge } = await searchParams;
  const allItems = await getInventoryRepository().listItems();
  const items = allItems.filter((i) => i.canonicalItemId === null).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistente de Consolidação"
        description="Une diferentes embalagens de compra do mesmo produto num único cadastro mestre — sempre transacional, nunca exclui histórico."
      />
      <ConsolidationWizard items={items} initialMasterId={master ?? null} initialMergedIds={merge ? [merge] : []} />
    </div>
  );
}
