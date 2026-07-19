import "server-only";
import { fetchOperationalOrders, type OperationalOrder } from "./operations-summary";
import { saoPauloDateISO, addDaysIso, isValidIsoDate } from "@/lib/utils/timezone";

export interface OperationalOrderDetailResult {
  order: OperationalOrder | null;
  jumpparkConfigured: boolean;
  error: string | null;
}

/**
 * Busca uma ordem específica pelo `externalId` (= `serviceOrderId` do JumpPark). A API não tem
 * endpoint de busca por ID — quando o chamador já sabe a data (link vindo da lista), a busca é
 * de um único dia; sem isso, usa uma janela de 90 dias como último recurso, igual ao padrão já
 * usado em `src/lib/orders/order-detail.ts`.
 */
export async function fetchOperationalOrderDetail(externalId: string, dateHint?: string): Promise<OperationalOrderDetailResult> {
  const from = isValidIsoDate(dateHint) ? dateHint : addDaysIso(saoPauloDateISO(), -90);
  const to = isValidIsoDate(dateHint) ? dateHint : saoPauloDateISO();

  const result = await fetchOperationalOrders(from, to);
  if (!result.jumpparkConfigured) return { order: null, jumpparkConfigured: false, error: result.error };
  if (result.error) return { order: null, jumpparkConfigured: true, error: result.error };

  const order = result.orders.find((o) => o.externalId === externalId) ?? null;
  return { order, jumpparkConfigured: true, error: null };
}
