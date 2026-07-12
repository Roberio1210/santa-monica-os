import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { AccountingPeriodView } from "@/components/finance/accounting-period-view";
import { fetchAccountingPeriodOverview } from "@/lib/finance/service";
import { getStorageMode } from "@/lib/storage/mode";

export const dynamic = "force-dynamic";

function currentCompetenceMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function FechamentoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const params = await searchParams;
  const competenceMonth = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : currentCompetenceMonth();
  const overview = await fetchAccountingPeriodOverview(competenceMonth);
  const storageMode = getStorageMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fechamento de Competência"
        description="Fechamento gerencial mensal — nunca automático. Reabertura sempre exige justificativa e fica registrada."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <AccountingPeriodView overview={overview} />
    </div>
  );
}
