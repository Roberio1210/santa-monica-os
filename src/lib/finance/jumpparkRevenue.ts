import "server-only";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jumpParkServiceOrders, jumpParkServiceOrderItems } from "@/db/schema/jumppark";
import type { JumpParkRevenueCandidateInput } from "@/lib/finance/dre";

/** Mesmo padrão usado em `iesaClosing.ts` — nunca duplicar a lista de itens "Lavação Parceria IESA", que tem seu próprio mecanismo de reconhecimento via accounts_receivable. */
const IESA_ITEM_DESCRIPTION_LIKE = "%iesa%";

/** Único valor de `situation` observado nos dados reais (ver docs/jumppark-data-map.md) — qualquer outro valor futuro (ex.: cancelamento) fica de fora por padrão, nunca inventamos o que significaria. */
const RECOGNIZED_SITUATION = "Pago";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface RawJumpParkOrderRow {
  id: string;
  externalId: string;
  orderDate: string;
  parkingAmount: string | number;
  servicesAmount: string | number;
  discountAmount: string | number | null;
  clientName: string | null;
  plateMasked: string | null;
}

/**
 * Missão Financeiro V3.1 — parte pura (sem banco) da derivação de receita JumpPark, isolada para
 * ser testável sem depender de uma conexão real: aplica exclusão de itens "Lavação Parceria IESA"
 * (já reconhecidos via `iesaClosing.ts`/accounts_receivable) e abate `discountAmount` do valor de
 * serviços, sempre travando em zero (nunca negativo — cortesia/desconto total nunca vira receita
 * negativa).
 */
export function mapOrdersToRevenueCandidates(orders: RawJumpParkOrderRow[], iesaAmountByOrderId: Map<string, number>): JumpParkRevenueCandidateInput[] {
  return orders.map((order) => {
    const iesaAmount = iesaAmountByOrderId.get(order.id) ?? 0;
    const discountAmount = Number(order.discountAmount ?? 0);
    const servicesAmount = Math.max(0, round2(Number(order.servicesAmount) - iesaAmount - discountAmount));
    return {
      externalId: order.externalId,
      orderDate: order.orderDate,
      parkingAmount: round2(Number(order.parkingAmount)),
      servicesAmount,
      clientName: order.clientName,
      plateMasked: order.plateMasked,
    };
  });
}

/**
 * Missão Financeiro V3.1 — receita operacional real do JumpPark para a DRE, direto de
 * `jumppark_service_orders` (nunca persistida em accounts_receivable). Sempre líquida de:
 * 1) itens "Lavação Parceria IESA" (já reconhecidos separadamente via `iesaClosing.ts`/AR —
 *    contá-los aqui também duplicaria a receita);
 * 2) `discount_amount`, quando informado (abatido do valor de serviços — não há campo de desconto
 *    próprio para estacionamento na fonte);
 * 3) ordens cujo `situation` não seja exatamente "Pago" (único valor confirmado nos dados reais).
 *
 * Busca TODAS as ordens (sem filtro de data) — mesmo padrão de `fetchDreSourceData` para
 * accounts_payable/receivable/cash_movements: o filtro de período acontece dentro de
 * `computeDreReport`, para permitir reaproveitar a mesma busca entre múltiplos relatórios
 * (comparação, por centro de custo, série mensal) sem repetir a consulta a cada período.
 *
 * Nunca grava nada — recalculada a cada chamada, então uma ordem nova sincronizada pelo cron diário
 * do JumpPark aparece automaticamente na próxima consulta da DRE.
 */
export async function fetchJumpParkRevenueCandidates(): Promise<JumpParkRevenueCandidateInput[]> {
  const db = getDb();
  if (!db) return [];

  const orders = await db
    .select({
      id: jumpParkServiceOrders.id,
      externalId: jumpParkServiceOrders.externalId,
      orderDate: jumpParkServiceOrders.orderDate,
      parkingAmount: jumpParkServiceOrders.parkingAmount,
      servicesAmount: jumpParkServiceOrders.servicesAmount,
      discountAmount: jumpParkServiceOrders.discountAmount,
      clientName: jumpParkServiceOrders.clientName,
      plateMasked: jumpParkServiceOrders.plateMasked,
    })
    .from(jumpParkServiceOrders)
    .where(eq(jumpParkServiceOrders.situation, RECOGNIZED_SITUATION));

  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const iesaItems = await db
    .select({ serviceOrderId: jumpParkServiceOrderItems.serviceOrderId, amount: jumpParkServiceOrderItems.amount })
    .from(jumpParkServiceOrderItems)
    .where(and(ilike(jumpParkServiceOrderItems.description, IESA_ITEM_DESCRIPTION_LIKE), inArray(jumpParkServiceOrderItems.serviceOrderId, orderIds)));

  const iesaAmountByOrderId = new Map<string, number>();
  for (const item of iesaItems) {
    iesaAmountByOrderId.set(item.serviceOrderId, (iesaAmountByOrderId.get(item.serviceOrderId) ?? 0) + Number(item.amount ?? 0));
  }

  return mapOrdersToRevenueCandidates(orders, iesaAmountByOrderId);
}
