import { PageHeader } from "@/components/shared/page-header";
import { GenerateRecurringView } from "@/components/finance/generate-recurring-view";
import { RecurringTemplateForm } from "@/components/finance/recurring-template-form";
import { fetchCostCenters, fetchExpenseCategories, fetchRecurringGenerationStatus, fetchSuppliers } from "@/lib/finance/service";

export const dynamic = "force-dynamic";

function currentCompetenceMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function GerarRecorrentesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const params = await searchParams;
  const competenceMonth = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : currentCompetenceMonth();
  const [items, suppliers, categories, costCenters] = await Promise.all([
    fetchRecurringGenerationStatus(competenceMonth),
    fetchSuppliers(),
    fetchExpenseCategories(),
    fetchCostCenters(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerar contas recorrentes"
        description="Transforma os modelos de recorrência em contas a pagar reais da competência selecionada. Nada é gerado automaticamente — só após confirmação explícita."
      />

      <RecurringTemplateForm suppliers={suppliers} categories={categories} costCenters={costCenters} />

      <GenerateRecurringView competenceMonth={competenceMonth} items={items} />
    </div>
  );
}
