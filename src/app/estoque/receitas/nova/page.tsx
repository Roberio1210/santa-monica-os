import { PageHeader } from "@/components/shared/page-header";
import { RecipeForm } from "@/components/inventory/recipe-form";
import { listServices } from "@/lib/inventory/services-catalog";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";

export const dynamic = "force-dynamic";

export default async function NovaReceitaPage() {
  const [services, rawItems] = await Promise.all([listServices(), getInventoryRepository().listItems()]);
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader title="Nova receita" description="Cria uma receita em rascunho — nenhuma dosagem é cadastrada até haver amostras de calibração." />
      <RecipeForm services={services} items={items} />
    </div>
  );
}
