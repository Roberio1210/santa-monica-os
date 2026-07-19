import "server-only";
import { fetchEligibleOrders } from "@/lib/orders/eligible-orders";
import { fetchOrderPreview } from "@/lib/orders/preview-service";
import { fetchConsumptionConfirmationsForOrder } from "@/lib/orders/consumption-history";
import { listServiceMappings } from "@/lib/orders/service-mapping";
import { listServices, type ServiceCatalogEntry } from "@/lib/inventory/services-catalog";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import type { EligibleOrder, OrderVehicleCategory, ServiceMapping } from "@/lib/orders/types";
import type { ConsumptionPreview } from "@/lib/orders/preview";
import type { ConsumptionConfirmationView } from "@/lib/orders/consumption-history";
import type { InventoryItemView } from "@/lib/inventory/types";

export interface OrderDetail {
  order: EligibleOrder;
  vehicleCategory: OrderVehicleCategory;
  preview: ConsumptionPreview;
  confirmations: ConsumptionConfirmationView[];
  serviceMappings: ServiceMapping[];
  services: ServiceCatalogEntry[];
  items: InventoryItemView[];
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Busca numa janela ampla (90 dias) — a ordem já foi vista antes na lista, então uma janela larga é só uma busca a mais, nunca inventa dado. */
export async function fetchOrderDetail(externalId: string): Promise<OrderDetail | null> {
  const startDate = isoDate(90);
  const endDate = isoDate(0);

  const result = await fetchEligibleOrders(startDate, endDate);
  const order = result.orders.find((o) => o.externalId === externalId);
  if (!order) return null;

  const [preview, confirmations, serviceMappings, services, rawItems] = await Promise.all([
    fetchOrderPreview(order),
    fetchConsumptionConfirmationsForOrder(externalId),
    listServiceMappings(),
    listServices(),
    getInventoryRepository().listItems(),
  ]);

  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { order, vehicleCategory: preview.vehicleCategory, preview, confirmations, serviceMappings, services, items };
}
