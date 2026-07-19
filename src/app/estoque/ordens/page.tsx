import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { OrdersView, type OrderRow } from "@/components/inventory/orders-view";
import { fetchEligibleOrders } from "@/lib/orders/eligible-orders";
import { fetchOrderPreview } from "@/lib/orders/preview-service";
import { classifyOrderStatus } from "@/lib/orders/status";
import { getInventoryConsumptionMode } from "@/lib/config/env";
import { Unavailable } from "@/components/shared/unavailable";

export const dynamic = "force-dynamic";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

export default async function OrdensPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const startDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : isoDate(30);
  const endDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : isoDate(0);

  const mode = getInventoryConsumptionMode();
  const result = await fetchEligibleOrders(startDate, endDate);

  const rows: OrderRow[] = await Promise.all(
    result.orders.map(async (order) => {
      const preview = await fetchOrderPreview(order);
      const status = classifyOrderStatus(preview, order.latestConfirmationStatus);
      return { order, status };
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordens JumpPark"
        description="Ordens finalizadas reais — nenhum consumo é baixado sem confirmação humana explícita."
        actions={<Badge variant={mode === "preview_and_confirm" ? "positive" : "outline"}>Modo: {mode}</Badge>}
      />

      {!result.jumpparkConfigured ? (
        <Unavailable label={result.error ?? "JumpPark não configurado neste ambiente."} />
      ) : result.error ? (
        <Unavailable label={result.error} />
      ) : (
        <OrdersView rows={rows} startDate={startDate} endDate={endDate} />
      )}
    </div>
  );
}
