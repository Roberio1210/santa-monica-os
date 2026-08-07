import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { customers, identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { aggregateJumpParkCustomersAndVehicles, type OrderForAggregation } from "@/lib/integrations/jumppark/customers";
import { jumpParkLogger } from "@/lib/integrations/jumppark/logger";

/**
 * Recalcula Clientes e Veículos (tabelas `customers`/`vehicles`, `source = 'jumppark'`) a partir
 * de TODAS as ordens hoje em `jumppark_service_orders` — não é um delta incremental por ordem
 * nova, é um recálculo completo disparado a cada sincronização (Missão 26). Decisão de CTO,
 * documentada: no volume atual (dezenas/centenas de ordens) e no volume esperado no curto prazo
 * (milhares), reprocessar tudo em memória é da ordem de milissegundos — uma sincronização
 * incremental "só do delta" seria complexidade real sem ganho comprovado agora. Se o volume
 * crescer para centenas de milhares de ordens, essa é a primeira otimização a revisitar.
 *
 * Nunca escreve nas linhas de clientes/veículos com `source != 'jumppark'` (clientes cadastrados
 * manualmente no Atendimento) — a chave de conflito é sempre `external_id`, que só é preenchido
 * aqui, nunca pelo fluxo manual do Atendimento.
 *
 * Missão 28 (revisão segura de identidade, 07/08/2026) — o recálculo agora também:
 *   1. Grava `identityConfidence`/`identityConfidenceReason` (puramente derivados, ver
 *      `customers.ts`) a cada passagem.
 *   2. Nunca sobrescreve `customer_id`/`vehicle_id` de uma ordem com `customer_link_locked = true`
 *      — é assim que uma decisão manual da fila "Identidades para revisar" sobrevive ao recálculo
 *      completo. Ordens não travadas são sempre atualizadas com o resultado mais recente da
 *      agregação, inclusive voltando a `null` se a evidência que as vinculava deixou de existir
 *      (autocorretivo: nunca fica "preso" com um vínculo que a regra atual não sustenta mais).
 *   3. Faz upsert dos itens da fila de revisão por `subjectKey`, atualizando só as colunas de
 *      evidência — nunca `status`/`decidedAt`/`decidedNotes` de um item já decidido por um humano.
 *      Itens cuja ambiguidade não existe mais nesta passagem são marcados `active = false` (nunca
 *      apagados) para preservar o histórico e permitir reverter.
 */

export interface CustomersRefreshResult {
  status: "success" | "not_configured";
  customersUpserted: number;
  vehiclesUpserted: number;
  ordersLinked: number;
  ordersUnlinked: number;
  reviewItemsUpserted: number;
  reviewItemsDeactivated: number;
}

export async function refreshJumpParkCustomers(): Promise<CustomersRefreshResult> {
  if (!isDatabaseConfigured()) {
    return { status: "not_configured", customersUpserted: 0, vehiclesUpserted: 0, ordersLinked: 0, ordersUnlinked: 0, reviewItemsUpserted: 0, reviewItemsDeactivated: 0 };
  }
  const db = getDb();
  if (!db) return { status: "not_configured", customersUpserted: 0, vehiclesUpserted: 0, ordersLinked: 0, ordersUnlinked: 0, reviewItemsUpserted: 0, reviewItemsDeactivated: 0 };

  const rows = await db
    .select({
      id: jumpParkServiceOrders.id,
      clientName: jumpParkServiceOrders.clientName,
      clientPhoneMasked: jumpParkServiceOrders.clientPhoneMasked,
      plateMasked: jumpParkServiceOrders.plateMasked,
      vehicleModel: jumpParkServiceOrders.vehicleModel,
      orderDate: jumpParkServiceOrders.orderDate,
      totalAmount: jumpParkServiceOrders.totalAmount,
      servicesAmount: jumpParkServiceOrders.servicesAmount,
      customerLinkLocked: jumpParkServiceOrders.customerLinkLocked,
      currentCustomerId: jumpParkServiceOrders.customerId,
      currentVehicleId: jumpParkServiceOrders.vehicleId,
    })
    .from(jumpParkServiceOrders);

  const orders: OrderForAggregation[] = rows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    clientPhoneMasked: r.clientPhoneMasked,
    plateMasked: r.plateMasked,
    vehicleModel: r.vehicleModel,
    orderDate: r.orderDate,
    totalAmount: Number(r.totalAmount),
    servicesAmount: Number(r.servicesAmount),
  }));
  const lockedOrderIds = new Set(rows.filter((r) => r.customerLinkLocked).map((r) => r.id));
  const currentLinkByOrderId = new Map(rows.map((r) => [r.id, { customerId: r.currentCustomerId, vehicleId: r.currentVehicleId }]));

  // Decisões manuais já tomadas (ordem travada + cliente já vinculado) — alimentam a agregação
  // pura para que a ordem conte nas estatísticas do cliente escolhido (ver customers.ts).
  const lockedLinkRows = await db
    .select({ orderId: jumpParkServiceOrders.id, customerExternalId: customers.externalId })
    .from(jumpParkServiceOrders)
    .innerJoin(customers, eq(jumpParkServiceOrders.customerId, customers.id))
    .where(eq(jumpParkServiceOrders.customerLinkLocked, true));
  const manualCustomerLinks = new Map(lockedLinkRows.filter((r) => r.customerExternalId).map((r) => [r.orderId, r.customerExternalId as string]));

  const aggregation = aggregateJumpParkCustomersAndVehicles(orders, manualCustomerLinks);

  const customerIdByExternalId = new Map<string, string>();
  for (const c of aggregation.customers) {
    const values = {
      name: c.name,
      totalSpent: String(c.totalSpent),
      lastVisit: c.lastVisitAt,
      firstVisitAt: c.firstVisitAt,
      visitCount: c.visitCount,
      averageTicket: String(c.averageTicket),
      servicesOrderCount: c.servicesOrderCount,
      identityConfidence: c.identityConfidence,
      identityConfidenceReason: c.identityConfidenceReason,
      source: "jumppark" as const,
      externalId: c.externalId,
    };
    const [row] = await db
      .insert(customers)
      .values(values)
      .onConflictDoUpdate({ target: customers.externalId, set: { ...values, updatedAt: new Date() } })
      .returning({ id: customers.id });
    customerIdByExternalId.set(c.externalId, row.id);
  }

  const vehicleIdByExternalId = new Map<string, string>();
  for (const v of aggregation.vehicles) {
    const ownerId = v.customerExternalId ? customerIdByExternalId.get(v.customerExternalId) : null;
    if (!ownerId) {
      jumpParkLogger.warn("Veículo sem cliente resolvido — pulado no recálculo.", { vehicleExternalId: v.externalId });
      continue;
    }
    const values = {
      customerId: ownerId,
      model: v.model,
      firstSeenAt: v.firstSeenAt,
      lastSeenAt: v.lastSeenAt,
      visitCount: v.visitCount,
      source: "jumppark" as const,
      externalId: v.externalId,
    };
    const [row] = await db
      .insert(vehicles)
      .values(values)
      .onConflictDoUpdate({ target: vehicles.externalId, set: { ...values, updatedAt: new Date() } })
      .returning({ id: vehicles.id });
    vehicleIdByExternalId.set(v.externalId, row.id);
  }

  let ordersLinked = 0;
  let ordersUnlinked = 0;
  for (const order of orders) {
    if (lockedOrderIds.has(order.id)) continue; // decisão manual — recálculo automático nunca sobrescreve.

    const custExtId = aggregation.orderCustomerExternalId.get(order.id) ?? null;
    const vehExtId = aggregation.orderVehicleExternalId.get(order.id) ?? null;
    const customerId = custExtId ? (customerIdByExternalId.get(custExtId) ?? null) : null;
    const vehicleId = vehExtId ? (vehicleIdByExternalId.get(vehExtId) ?? null) : null;

    if (customerId || vehicleId) ordersLinked += 1;
    else ordersUnlinked += 1;

    const current = currentLinkByOrderId.get(order.id);
    if (current && current.customerId === customerId && current.vehicleId === vehicleId) continue; // já reflete o resultado atual — evita escrita sem necessidade.

    await db.update(jumpParkServiceOrders).set({ customerId, vehicleId, updatedAt: new Date() }).where(eq(jumpParkServiceOrders.id, order.id));
  }

  // Fila de revisão — upsert por subjectKey, sem nunca tocar em status/decidedAt/decidedNotes de
  // itens já decididos por um humano (só as colunas de evidência abaixo).
  const seenSubjectKeys = new Set<string>();
  let reviewItemsUpserted = 0;
  for (const item of aggregation.reviewItems) {
    seenSubjectKeys.add(item.subjectKey);
    const candidatesWithCustomerId = item.candidates.map((c) => ({ ...c, customerId: customerIdByExternalId.get(c.customerExternalId) ?? null }));
    const evidence = { candidates: candidatesWithCustomerId, unresolvedOrders: item.unresolvedOrders };

    await db
      .insert(identityReviewItems)
      .values({
        subjectKey: item.subjectKey,
        plateMasked: item.plateMasked,
        confidence: "ambiguo",
        rule: item.rule,
        evidence,
        active: true,
        source: "jumppark",
      })
      .onConflictDoUpdate({
        target: identityReviewItems.subjectKey,
        set: { plateMasked: item.plateMasked, rule: item.rule, evidence, active: true, updatedAt: new Date() },
      });
    reviewItemsUpserted += 1;
  }

  // Itens que existiam mas cuja ambiguidade não foi detectada nesta passagem: marcar inativos
  // (nunca apagar — preserva histórico e permite reverter se a ambiguidade reaparecer).
  const staleRows = await db.select({ subjectKey: identityReviewItems.subjectKey }).from(identityReviewItems).where(eq(identityReviewItems.active, true));
  const staleKeys = staleRows.map((r) => r.subjectKey).filter((key) => !seenSubjectKeys.has(key));
  let reviewItemsDeactivated = 0;
  if (staleKeys.length > 0) {
    await db
      .update(identityReviewItems)
      .set({ active: false, updatedAt: new Date() })
      .where(inArray(identityReviewItems.subjectKey, staleKeys));
    reviewItemsDeactivated = staleKeys.length;
  }

  jumpParkLogger.info("Recálculo de Clientes/Veículos concluído.", {
    ordersProcessed: orders.length,
    customersUpserted: aggregation.customers.length,
    vehiclesUpserted: vehicleIdByExternalId.size,
    ordersLinked,
    ordersUnlinked,
    reviewItemsUpserted,
    reviewItemsDeactivated,
  });

  return {
    status: "success",
    customersUpserted: aggregation.customers.length,
    vehiclesUpserted: vehicleIdByExternalId.size,
    ordersLinked,
    ordersUnlinked,
    reviewItemsUpserted,
    reviewItemsDeactivated,
  };
}
