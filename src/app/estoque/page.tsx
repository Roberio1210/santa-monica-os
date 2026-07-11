import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { InventoryView } from "@/components/inventory/inventory-view";
import { fetchInventoryOverview } from "@/lib/inventory/service";
import { getStorageMode } from "@/lib/storage/mode";
import { ClipboardCheck } from "lucide-react";

// Evita que o estoque fique congelado no HTML estático gerado em build — agora que pode vir de
// um banco real e mutável (PostgresInventoryRepository), o build-time snapshot ficaria
// permanentemente desatualizado sem isso.
export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const { items, summary } = await fetchInventoryOverview();
  const storageMode = getStorageMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Contagem física registrada em 10/07/2026 — dados reais, sem estimativas inventadas."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="positive">
              <ClipboardCheck className="h-3 w-3" />
              Contagem manual
            </Badge>
            <StorageModeBadge mode={storageMode} />
          </div>
        }
      />

      <InventoryView items={items} summary={summary} />
    </div>
  );
}
