import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jumpParkServiceOrders, jumpParkServiceOrderItems } from "@/db/schema/jumppark";
import { partners } from "@/db/schema/finance";
import { orderMatchesPartnerKeywords } from "@/lib/finance/corporatePartnerRevenue";

export interface RefreshJumpParkPartnerLinksResult {
  ordersChecked: number;
  ordersLinked: number;
}

/**
 * Missão Financeiro V4.2 — vincula formalmente ordens do JumpPark a parceiros corporativos
 * (`partners.jumppark_match_keywords`), substituindo a dependência de texto solto no nome do
 * serviço. `fromDate`/`toDate` são OBRIGATÓRIOS de propósito: esta função nunca deve rodar sobre
 * todo o histórico sem uma decisão explícita de intervalo — a auditoria de julho/2026 encontrou
 * meses (março a junho) com dados ainda pendentes de conferência com a planilha oficial, que não
 * devem ganhar vínculo (e portanto não mudar de classificação na DRE) sem essa conferência.
 *
 * Idempotente e seguro para rodar de novo: nunca sobrescreve uma ordem com `partner_link_locked =
 * true` (mesmo padrão de `customerLinkLocked`/`refreshJumpParkCustomers`), e só atualiza `partner_id`
 * quando o valor calculado realmente muda.
 */
export async function refreshJumpParkPartnerLinks(fromDate: string, toDate: string): Promise<RefreshJumpParkPartnerLinksResult> {
  const db = getDb();
  if (!db) return { ordersChecked: 0, ordersLinked: 0 };

  const corporatePartners = await db
    .select({ id: partners.id, jumpparkMatchKeywords: partners.jumpparkMatchKeywords })
    .from(partners)
    .where(and(eq(partners.active, true)));
  const partnersWithKeywords = corporatePartners.filter((p): p is { id: string; jumpparkMatchKeywords: string[] } => (p.jumpparkMatchKeywords?.length ?? 0) > 0);
  if (partnersWithKeywords.length === 0) return { ordersChecked: 0, ordersLinked: 0 };

  const orders = await db
    .select({ id: jumpParkServiceOrders.id, clientName: jumpParkServiceOrders.clientName, partnerId: jumpParkServiceOrders.partnerId })
    .from(jumpParkServiceOrders)
    .where(and(gte(jumpParkServiceOrders.orderDate, fromDate), lte(jumpParkServiceOrders.orderDate, toDate), eq(jumpParkServiceOrders.partnerLinkLocked, false)));
  if (orders.length === 0) return { ordersChecked: 0, ordersLinked: 0 };

  const orderIds = orders.map((o) => o.id);
  const items = await db
    .select({ orderId: jumpParkServiceOrderItems.serviceOrderId, description: jumpParkServiceOrderItems.description })
    .from(jumpParkServiceOrderItems)
    .where(inArray(jumpParkServiceOrderItems.serviceOrderId, orderIds));

  const itemsByOrderId = new Map<string, { description: string | null }[]>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push({ description: item.description });
    itemsByOrderId.set(item.orderId, list);
  }

  let ordersLinked = 0;
  for (const order of orders) {
    const orderItems = itemsByOrderId.get(order.id) ?? [];
    const matchedPartner = partnersWithKeywords.find((p) => orderMatchesPartnerKeywords({ clientName: order.clientName }, orderItems, p.jumpparkMatchKeywords));
    const newPartnerId = matchedPartner?.id ?? null;
    if (newPartnerId !== order.partnerId) {
      await db.update(jumpParkServiceOrders).set({ partnerId: newPartnerId }).where(eq(jumpParkServiceOrders.id, order.id));
      ordersLinked++;
    }
  }

  return { ordersChecked: orders.length, ordersLinked };
}

/** Para diagnóstico/validação — nunca usado pelo cálculo de receita (que sempre olha `partner_id` direto). */
export async function countLinkedJumpParkOrders(partnerId: string, fromDate?: string, toDate?: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const conditions = [eq(jumpParkServiceOrders.partnerId, partnerId)];
  if (fromDate) conditions.push(gte(jumpParkServiceOrders.orderDate, fromDate));
  if (toDate) conditions.push(lte(jumpParkServiceOrders.orderDate, toDate));
  const rows = await db.select({ id: jumpParkServiceOrders.id }).from(jumpParkServiceOrders).where(and(...conditions));
  return rows.length;
}
