import "server-only";
import { and, eq, gte, lte, ilike, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jumpParkServiceOrders, jumpParkServiceOrderItems } from "@/db/schema/jumppark";
import type { JumpParkRevenueCandidateInput } from "@/lib/finance/dre";
import { LEGACY_IESA_FALLBACK_KEYWORD, resolveOrderCorporateExclusionAmount } from "@/lib/finance/corporatePartnerRevenue";

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
  /** Missão V4.2 — vínculo formal com parceiro corporativo (`jumppark_service_orders.partner_id`). Quando preenchido, a ordem INTEIRA é excluída daqui (ver `resolveOrderCorporateExclusionAmount`). */
  partnerId: string | null;
}

export interface RawJumpParkOrderItemRow {
  serviceOrderId: string;
  description: string | null;
  amount: string | number | null;
}

/**
 * Missão Financeiro V3.1 (ampliada na V4.2) — parte pura (sem banco) da derivação de receita
 * JumpPark, isolada para ser testável sem depender de uma conexão real: exclui a receita já
 * reconhecida via o fechamento consolidado de parceiros corporativos (`accounts_receivable`, ver
 * `corporatePartnerRevenue.ts`) e abate `discountAmount`, sempre travando em zero (nunca negativo —
 * cortesia/desconto total nunca vira receita negativa).
 *
 * Missão V4.2 — a exclusão passou de "só o item cuja descrição contém 'iesa'" para "a ordem
 * INTEIRA, quando vinculada formalmente a um parceiro corporativo" (`partner_id`), porque a
 * auditoria de julho/2026 encontrou serviços reais da IESA (ex.: "Polimento Peça - Nissan") que o
 * texto antigo nunca capturava. Ordens sem vínculo formal ainda caem no mecanismo textual histórico
 * (só para o parceiro que já tinha esse texto antes desta missão — nunca estendido a outro), para
 * não alterar nenhum mês já auditado (março-junho/2026) sem confirmação explícita.
 */
export function mapOrdersToRevenueCandidates(orders: RawJumpParkOrderRow[], itemsByOrderId: Map<string, RawJumpParkOrderItemRow[]>): JumpParkRevenueCandidateInput[] {
  return orders.map((order) => {
    const items = (itemsByOrderId.get(order.id) ?? []).map((it) => ({ description: it.description, amount: Number(it.amount ?? 0) }));
    const exclusionAmount = resolveOrderCorporateExclusionAmount(
      { servicesAmount: Number(order.servicesAmount), discountAmount: order.discountAmount !== null ? Number(order.discountAmount) : null, partnerId: order.partnerId },
      items,
    );
    const discountAmount = Number(order.discountAmount ?? 0);
    const servicesAmount = Math.max(0, round2(Number(order.servicesAmount) - exclusionAmount - discountAmount));
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
 * Missão Financeiro V3.1 (ampliada na V4.2) — receita operacional real do JumpPark para a DRE,
 * direto de `jumppark_service_orders` (nunca persistida em accounts_receivable). Sempre líquida de:
 * 1) ordens vinculadas a um parceiro corporativo (`partner_id`, ver `corporatePartnerRevenue.ts`) —
 *    já reconhecidas separadamente via o fechamento consolidado (`accounts_receivable`) daquele
 *    parceiro, contá-las aqui também duplicaria a receita; para ordens ainda sem vínculo formal,
 *    mantém o filtro textual histórico só para não alterar meses já auditados;
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
      partnerId: jumpParkServiceOrders.partnerId,
    })
    .from(jumpParkServiceOrders)
    .where(eq(jumpParkServiceOrders.situation, RECOGNIZED_SITUATION));

  if (orders.length === 0) return [];

  const unlinkedOrderIds = orders.filter((o) => o.partnerId === null).map((o) => o.id);
  const legacyItems =
    unlinkedOrderIds.length === 0
      ? []
      : await db
          .select({ serviceOrderId: jumpParkServiceOrderItems.serviceOrderId, description: jumpParkServiceOrderItems.description, amount: jumpParkServiceOrderItems.amount })
          .from(jumpParkServiceOrderItems)
          .where(and(ilike(jumpParkServiceOrderItems.description, `%${LEGACY_IESA_FALLBACK_KEYWORD}%`), inArray(jumpParkServiceOrderItems.serviceOrderId, unlinkedOrderIds)));

  const itemsByOrderId = new Map<string, RawJumpParkOrderItemRow[]>();
  for (const item of legacyItems) {
    const list = itemsByOrderId.get(item.serviceOrderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.serviceOrderId, list);
  }

  return mapOrdersToRevenueCandidates(orders, itemsByOrderId);
}

export interface JumpParkPaymentBreakdown {
  total: number;
  dinheiro: number;
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
  outros: number;
}

/**
 * Missão Financeiro V3.3 — quanto do faturamento JumpPark de um período foi recebido em cada forma
 * de pagamento, com destaque para "Dinheiro" (nunca aparece no extrato Stone/bancário, por
 * definição — ver `revenueReconciliation.ts`). Não confundir com receita da DRE: aqui o total é o
 * `total_amount` bruto de cada ordem "Pago" no período, sem a exclusão de itens IESA/desconto que
 * `fetchJumpParkRevenueCandidates` aplica — o objetivo é conciliação de fluxo de recebimento, não
 * reconhecimento de receita.
 */
export async function fetchJumpParkPaymentBreakdown(dateFrom: string, dateTo: string): Promise<JumpParkPaymentBreakdown> {
  const db = getDb();
  if (!db) return { total: 0, dinheiro: 0, cartaoDebito: 0, cartaoCredito: 0, pix: 0, outros: 0 };

  const rows = await db
    .select({ paymentMethod: jumpParkServiceOrders.paymentMethod, total: sql<string>`sum(${jumpParkServiceOrders.totalAmount})` })
    .from(jumpParkServiceOrders)
    .where(and(gte(jumpParkServiceOrders.orderDate, dateFrom), lte(jumpParkServiceOrders.orderDate, dateTo), eq(jumpParkServiceOrders.situation, RECOGNIZED_SITUATION)))
    .groupBy(jumpParkServiceOrders.paymentMethod);

  const result: JumpParkPaymentBreakdown = { total: 0, dinheiro: 0, cartaoDebito: 0, cartaoCredito: 0, pix: 0, outros: 0 };
  for (const row of rows) {
    const amount = round2(Number(row.total ?? 0));
    result.total = round2(result.total + amount);
    switch (row.paymentMethod) {
      case "Dinheiro":
        result.dinheiro = amount;
        break;
      case "Débito":
        result.cartaoDebito = amount;
        break;
      case "Crédito":
        result.cartaoCredito = amount;
        break;
      case "Pix":
        result.pix = amount;
        break;
      default:
        result.outros = round2(result.outros + amount);
    }
  }
  return result;
}
