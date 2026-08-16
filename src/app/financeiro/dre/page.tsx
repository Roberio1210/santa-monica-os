import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { DreView } from "@/components/finance/dre-view";
import {
  fetchDreByCostCenterGroups,
  fetchDreComparison,
  fetchDreMonthlySeries,
  fetchDrePendencyOverview,
  fetchDreSourceData,
  computeAccountingAlerts,
  computeDreCoverage,
} from "@/lib/finance/service";
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

function monthsFromJanuaryToCurrent(): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let m = 0; m <= now.getUTCMonth(); m++) {
    months.push(`${now.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`);
  }
  return months;
}

export default async function DrePage({ searchParams }: { searchParams: Promise<DreSearchParams> }) {
  const params = await searchParams;
  const defaultRange = currentMonthRange();
  const regime: DreRegime = params.regime === "caixa" ? "caixa" : params.regime === "competencia" ? "competencia" : "gerencial";
  const from = params.from || defaultRange.from;
  const to = params.to || defaultRange.to;
  const costCenterGroup = (params.costCenterGroup as DreCostCenterGroup | "consolidado" | undefined) ?? "consolidado";
  const previousRange = previousMonthRange(from);
  const today = new Date().toISOString().slice(0, 10);
  const months = monthsFromJanuaryToCurrent();
  const currentMonth = today.slice(0, 7);

  // Uma única busca de dados-fonte, reaproveitada pelos 3 relatórios abaixo — ver comentário em
  // fetchDreSourceData (Missão V3.0): buscar 3x em paralelo serializa no pool de conexão único do
  // Neon e torna o carregamento da página lentíssimo.
  const sourceData = await fetchDreSourceData();
  const [comparison, byCostCenter, monthlySeries] = await Promise.all([
    fetchDreComparison(regime, from, to, previousRange.from, previousRange.to, costCenterGroup, sourceData),
    fetchDreByCostCenterGroups(regime, from, to, sourceData),
    // Agosto (e qualquer mês corrente) é sempre parcial — corta em "hoje", nunca inventa dado até o fim do mês.
    fetchDreMonthlySeries(regime, months, costCenterGroup, { [currentMonth]: { to: today } }, sourceData),
  ]);

  const pendencyOverview = await fetchDrePendencyOverview(comparison.current);
  const coverage = computeDreCoverage(comparison.current);
  const isPartialPeriod = to > today;
  const alerts = computeAccountingAlerts(comparison.current, comparison.previous, byCostCenter, coverage, isPartialPeriod);
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
        monthlySeries={monthlySeries}
        pendencyOverview={pendencyOverview}
        coverage={coverage}
      />
    </div>
  );
}
