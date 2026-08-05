import "server-only";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { customers, vehicles } from "@/db/schema/crm";
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
 */

export interface CustomersRefreshResult {
  status: "success" | "not_configured";
  customersUpserted: number;
  vehiclesUpserted: number;
  ordersLinked: number;
}

export async function refreshJumpParkCustomers(): Promise<CustomersRefreshResult> {
  if (!isDatabaseConfigured()) {
    return { status: "not_configured", customersUpserted: 0, vehiclesUpserted: 0, ordersLinked: 0 };
  }
  const db = getDb();
  if (!db) return { status: "not_configured", customersUpserted: 0, vehiclesUpserted: 0, ordersLinked: 0 };

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

  const aggregation = aggregateJumpParkCustomersAndVehicles(orders);

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
  for (const order of orders) {
    const custExtId = aggregation.orderCustomerExternalId.get(order.id) ?? null;
    const vehExtId = aggregation.orderVehicleExternalId.get(order.id) ?? null;
    const customerId = custExtId ? (customerIdByExternalId.get(custExtId) ?? null) : null;
    const vehicleId = vehExtId ? (vehicleIdByExternalId.get(vehExtId) ?? null) : null;
    if (!customerId && !vehicleId) continue;

    await db.update(jumpParkServiceOrders).set({ customerId, vehicleId, updatedAt: new Date() }).where(eq(jumpParkServiceOrders.id, order.id));
    ordersLinked += 1;
  }

  jumpParkLogger.info("Recálculo de Clientes/Veículos concluído.", {
    ordersProcessed: orders.length,
    customersUpserted: aggregation.customers.length,
    vehiclesUpserted: vehicleIdByExternalId.size,
    ordersLinked,
  });

  return {
    status: "success",
    customersUpserted: aggregation.customers.length,
    vehiclesUpserted: vehicleIdByExternalId.size,
    ordersLinked,
  };
}
