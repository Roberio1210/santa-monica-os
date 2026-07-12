import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CashFlowView } from "@/components/finance/cash-flow-view";
import { fetchCashFlowOverview, fetchCostCenters, fetchPartners, fetchRevenueCategories, fetchSuppliers } from "@/lib/finance/service";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { getStorageMode } from "@/lib/storage/mode";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function FluxoDeCaixaPage({ searchParams }: { searchParams: Promise<{ tipo?: string; data?: string }> }) {
  const { tipo, data } = await searchParams;
  const asOfDate = todayIso();
  const [overview, revenueCategories, expenseCategories, costCenters, partners, suppliers] = await Promise.all([
    fetchCashFlowOverview(asOfDate),
    fetchRevenueCategories(),
    getFinanceRepository().listFinancialCategories("despesa"),
    fetchCostCenters(),
    fetchPartners(),
    fetchSuppliers(),
  ]);
  const categories = [...revenueCategories, ...expenseCategories];
  const storageMode = getStorageMode();
  const initialTypeFilter = tipo === "entrada" || tipo === "saida" ? tipo : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="O núcleo financeiro: toda entrada e toda saída, saldos por conta, projeção e Livro Caixa."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <CashFlowView
        dashboard={overview.dashboard}
        projection={overview.projection}
        alerts={overview.alerts}
        ledger={overview.ledger}
        accounts={overview.accounts}
        categories={categories}
        costCenters={costCenters}
        partners={partners}
        suppliers={suppliers}
        asOfDate={asOfDate}
        initialTypeFilter={initialTypeFilter}
        initialDateFrom={data}
        initialDateTo={data}
      />
    </div>
  );
}
