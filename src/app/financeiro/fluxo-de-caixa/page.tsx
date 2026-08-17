import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CashFlowView } from "@/components/finance/cash-flow-view";
import { fetchCashFlowOverview, fetchCostCenters, fetchPartners, fetchRevenueCategories, fetchSuppliers } from "@/lib/finance/service";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { getStorageMode } from "@/lib/storage/mode";
import { resolveCashFlowPeriod } from "@/lib/finance/period";
import type { CashFlowPeriodPreset } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const VALID_PRESETS: CashFlowPeriodPreset[] = ["hoje", "7_dias", "mes_atual", "mes_anterior", "personalizado"];

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; data?: string; periodo?: string; de?: string; ate?: string }>;
}) {
  const { tipo, data, periodo, de, ate } = await searchParams;
  const asOfDate = todayIso();
  const preset = VALID_PRESETS.includes(periodo as CashFlowPeriodPreset) ? (periodo as CashFlowPeriodPreset) : "mes_atual";
  const period = resolveCashFlowPeriod(preset, asOfDate, de, ate);

  const [overview, revenueCategories, expenseCategories, costCenters, partners, suppliers] = await Promise.all([
    fetchCashFlowOverview(asOfDate, period.from, period.to),
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
        receivablesAging={overview.receivablesAging}
        payablesAging={overview.payablesAging}
        categories={categories}
        costCenters={costCenters}
        partners={partners}
        suppliers={suppliers}
        asOfDate={asOfDate}
        initialTypeFilter={initialTypeFilter}
        initialDateFrom={data ?? period.from}
        initialDateTo={data ?? period.to}
        periodPreset={preset}
        periodFrom={period.from}
        periodTo={period.to}
      />
    </div>
  );
}
