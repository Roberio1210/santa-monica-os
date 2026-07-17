import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { RecipeDetailView } from "@/components/inventory/recipe-detail-view";
import { fetchRecipeDetail } from "@/lib/recipes/catalog";

export const dynamic = "force-dynamic";

export default async function ReceitaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchRecipeDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`${detail.serviceName} — ${detail.itemName}`} description={`${detail.recipe.vehicleCategory} · ${detail.recipe.processStep} · v${detail.recipe.version}`} />
      <RecipeDetailView detail={detail} />
    </div>
  );
}
