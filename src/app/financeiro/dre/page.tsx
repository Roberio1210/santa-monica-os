import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { DreView } from "@/components/finance/dre-view";
import { fetchDreByCostCenterGroups, fetchDreComparison, computeAccountingAlerts } from "@/lib/finance/service";
import { getStorageMode } from "@/lib/storage/mode";
import type { DreCostCenterGroup, DreRegime } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function previousMonthRange(from: string): { from: string; to: string } {
  const date = new Date(`${from}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const prevFrom = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const prevTo = new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).toISOString().slice(0, 10);
  return { from: prevFrom, to: prevTo };
}

interface DreSearchParams {
  regime?: string;
  from?: string;
  to?: string;
  costCenterGroup?: string;
}

export default async function DrePage({ searchParams }: { searchParams: Promise<DreSearchParams> }) {
  const params = await searchParams;
  const defaultRange = currentMonthRange();
  const regime: DreRegime = params.regime === "caixa" ? "caixa" : "competencia";
  const from = params.from || defaultRange.from;
  const to = params.to || defaultRange.to;
  const costCenterGroup = (params.costCenterGroup as DreCostCenterGroup | "consolidado" | undefined) ?? "consolidado";
  const previousRange = previousMonthRange(from);

  const [comparison, byCostCenter] = await Promise.all([
    fetchDreComparison(regime, from, to, previousRange.from, previousRange.to, costCenterGroup),
    fetchDreByCostCenterGroups(regime, from, to),
  ]);

  const alerts = computeAccountingAlerts(comparison.current, comparison.previous, byCostCenter);
  const storageMode = getStorageMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="DRE Gerencial"
        description="DRE gerencial para apoio à administração. Não substitui escrituração contábil, demonstrações oficiais ou obrigações preparadas pela contabilidade."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <DreView
        report={comparison.current}
        previous={comparison.previous}
        byCostCenter={byCostCenter}
        alerts={alerts}
        regime={regime}
        from={from}
        to={to}
        costCenterGroup={costCenterGroup}
      />
    </div>
  );
}
