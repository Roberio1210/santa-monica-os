import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RecipesView } from "@/components/inventory/recipes-view";
import { listRecipesWithNames } from "@/lib/recipes/catalog";
import type { RecipeStatus } from "@/lib/recipes/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: RecipeStatus[] = ["rascunho", "em_calibracao", "aprovada", "suspensa"];

export default async function ReceitasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus = VALID_STATUS.find((s) => s === status);
  const recipes = await listRecipesWithNames();

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
      <RecipesView recipes={recipes} initialStatus={initialStatus} />
    </div>
  );
}
