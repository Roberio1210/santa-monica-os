import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { AccountsPayableListView, type QuickFilter } from "@/components/finance/accounts-payable-view";
import { fetchAccountsPayableOverview } from "@/lib/finance/service";
import { getStorageMode } from "@/lib/storage/mode";

// Evita que a lista fique congelada no HTML estático gerado em build — mesmo motivo de
// /financeiro/contas-a-receber e /estoque: a fonte pode ser um banco real e mutável.
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const VALID_QUICK_FILTERS: QuickFilter[] = ["pendente", "vencida", "paga_no_mes", "7_dias", "30_dias", "vence_hoje", "vence_amanha"];

export default async function ContasAPagarPage({ searchParams }: { searchParams: Promise<{ quick?: string }> }) {
  const { quick } = await searchParams;
  const asOfDate = todayIso();
  const { items, summary } = await fetchAccountsPayableOverview(asOfDate);
  const storageMode = getStorageMode();
  const initialQuickFilter = VALID_QUICK_FILTERS.find((f) => f === quick);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a Pagar"
        description="Fornecedores, recorrências e obrigações da empresa — protegido pelo gate de acesso atual."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <AccountsPayableListView items={items} summary={summary} asOfDate={asOfDate} initialQuickFilter={initialQuickFilter} />
    </div>
  );
}
