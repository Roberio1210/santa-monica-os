import { PageHeader } from "@/components/shared/page-header";
import { CalibracaoView } from "@/components/inventory/calibracao-view";
import { listServices } from "@/lib/inventory/services-catalog";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { toItemView } from "@/lib/inventory/status";

export const dynamic = "force-dynamic";

export default async function CalibracaoPage() {
  const [services, rawItems, recipes] = await Promise.all([listServices(), getInventoryRepository().listItems(), getRecipeRepository().listRecipes()]);
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calibração"
        description="Registra uma amostra real de consumo. Se a receita para esta combinação ainda não existir, ela é criada em rascunho — nenhuma baixa de estoque acontece aqui."
      />
      <CalibracaoView services={services} items={items} recipes={recipes.filter((r) => r.isActiveVersion)} />
    </div>
  );
}
