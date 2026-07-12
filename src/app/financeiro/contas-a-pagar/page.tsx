import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { AccountsPayableListView } from "@/components/finance/accounts-payable-view";
import { fetchAccountsPayableOverview } from "@/lib/finance/service";
import { getStorageMode } from "@/lib/storage/mode";

// Evita que a lista fique congelada no HTML estático gerado em build — mesmo motivo de
// /financeiro/contas-a-receber e /estoque: a fonte pode ser um banco real e mutável.
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ContasAPagarPage() {
  const asOfDate = todayIso();
  const { items, summary } = await fetchAccountsPayableOverview(asOfDate);
  const storageMode = getStorageMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a Pagar"
        description="Fornecedores, recorrências e obrigações da empresa — protegido pelo gate de acesso atual."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <AccountsPayableListView items={items} summary={summary} asOfDate={asOfDate} />
    </div>
  );
}
