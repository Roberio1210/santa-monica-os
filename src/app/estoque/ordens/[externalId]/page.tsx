import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { OrderDetailView } from "@/components/inventory/order-detail-view";
import { fetchOrderDetail } from "@/lib/orders/order-detail";
import { getInventoryConsumptionMode } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export default async function OrdemDetalhePage({ params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;
  const detail = await fetchOrderDetail(externalId);
  if (!detail) notFound();

  const mode = getInventoryConsumptionMode();

  return (
    <div className="space-y-6">
      <PageHeader title={`Ordem ${externalId}`} description={`${detail.order.clientName ?? "Cliente não informado"} — ${detail.order.vehicleModel}`} />
      <OrderDetailView detail={detail} mode={mode} />
    </div>
  );
}
