import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { AccountsReceivableView } from "@/components/finance/accounts-receivable-view";
import { fetchAccountsReceivableOverview } from "@/lib/finance/service";
import { getStorageMode } from "@/lib/storage/mode";

// Evita que a lista de contas a receber fique congelada no HTML estático gerado em build —
// mesmo motivo de /estoque: agora pode vir de um banco real e mutável.
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ContasAReceberPage() {
  const asOfDate = todayIso();
  const { items, summary } = await fetchAccountsReceivableOverview(asOfDate);
  const storageMode = getStorageMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a Receber"
        description="O que é devido, por quem, quando e se já foi recebido — nunca confundir com faturamento operacional."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <AccountsReceivableView items={items} summary={summary} asOfDate={asOfDate} />
    </div>
  );
}
