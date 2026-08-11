import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RecipesView } from "@/components/inventory/recipes-view";
import { ServiceCostSection } from "@/components/inventory/service-cost-section";
import { listRecipesWithNames, listServiceCostEstimates } from "@/lib/recipes/catalog";
import type { RecipeStatus } from "@/lib/recipes/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: RecipeStatus[] = ["rascunho", "em_calibracao", "aprovada", "suspensa"];

export default async function ReceitasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus = VALID_STATUS.find((s) => s === status);
  const [recipes, serviceCosts] = await Promise.all([listRecipesWithNames(), listServiceCostEstimates()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receitas técnicas"
        description="Consumo esperado por serviço, categoria de veículo, etapa e produto — só receitas aprovadas alimentam consumo automático nas próximas fases."
        actions={
          <Button asChild>
            <Link href="/estoque/receitas/nova">Nova receita</Link>
          </Button>
        }
      />
      <ServiceCostSection summaries={serviceCosts} />
      <RecipesView recipes={recipes} initialStatus={initialStatus} />
    </div>
  );
}
