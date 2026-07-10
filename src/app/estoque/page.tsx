import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { InventoryView } from "@/components/inventory/inventory-view";
import { fetchInventoryOverview } from "@/lib/inventory/service";
import { ClipboardCheck } from "lucide-react";

export default async function EstoquePage() {
  const { items, summary } = await fetchInventoryOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Contagem física registrada em 10/07/2026 — dados reais, sem estimativas inventadas."
        actions={
          <Badge variant="positive">
            <ClipboardCheck className="h-3 w-3" />
            Contagem manual
          </Badge>
        }
      />

      <InventoryView items={items} summary={summary} />
    </div>
  );
}
