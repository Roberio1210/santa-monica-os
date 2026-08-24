import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { getManagerAssistantRepository } from "@/lib/manager-assistant/repository-factory";
import { DISCOUNT_REASON_LABELS, type Discount } from "@/lib/manager-assistant/types";
import type { Customer, ServiceOrder, ServiceVisit, TechnicalRecommendation, Vehicle } from "@/lib/attendance/types";
import { computeCustomerProfile, computeCustomerStatus } from "@/lib/crm-intelligente/profile";
import type { CustomerProfile, CustomerStatus } from "@/lib/crm-intelligente/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Carteira completa de clientes (Missão 25) — reaproveita exatamente a mesma fonte e o mesmo
 * cálculo de perfil (`computeCustomerProfile`) usados no detalhe do CRM Inteligente, para nunca
 * haver dois números diferentes para o mesmo cliente entre a lista e o detalhe. Único ponto de
 * I/O deste arquivo: AttendanceRepository (customers/vehicles/visitas/ordens) e
 * ManagerAssistantRepository (descontos, como proxy real de "cortesia concedida").
 *
 * Missão de Performance do CRM — achado real (confirmação com chamada real ao Zézinho, autenticado
 * como admin, missão Z4): a versão anterior buscava vehicles/visits/orders/recommendations UM
 * CLIENTE POR VEZ (`Promise.all` de N chamadas por cliente). Com o pool real do banco em `max: 1`
 * (`db/client.ts`, deliberado para serverless — nunca aumentado aqui), essas consultas ficam
 * serializadas numa única conexão: medido em produção, ~740ms/cliente — 331 clientes reais
 * levavam ~9 minutos, estourando qualquer timeout razoável (o próprio Zézinho, `/crm/sem-retorno`
 * e `/crm/fidelizacao` dependem desta função). Reescrito para buscar tudo em lote (poucas
 * consultas fixas, nunca uma por cliente) e agrupar em memória — mesmo resultado por cliente,
 * ordens de grandeza mais rápido.
 */

export interface CustomerOverviewEntry {
  customer: Customer;
  profile: CustomerProfile;
  status: CustomerStatus;
  statusReason: string;
  primaryVehicle: Vehicle | null;
  /** Serviços da visita mais recente — nome real do catálogo, nunca inventado. */
  lastServiceNames: string[];
  /** Recomendação cujo atendimento nunca virou Ordem de Serviço — mesma definição de `attendance/history.ts`. */
  pendingRecommendationsCount: number;
  /** Desconto/cortesia mais recente concedido a este cliente, quando existir — dado real de `service_order_discounts`. */
  lastCourtesy: { description: string; grantedAt: string; amount: number } | null;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

/** Pura — mesma lógica por cliente de antes (`loadOverviewEntry`), só que lendo de listas já buscadas em lote em vez de consultar o banco de novo. */
function buildOverviewEntry(
  customer: Customer,
  catalog: Map<string, string>,
  vehicles: Vehicle[],
  visits: ServiceVisit[],
  orders: ServiceOrder[],
  recommendations: TechnicalRecommendation[],
  discountsInScope: Discount[],
): CustomerOverviewEntry {
  const servicePriceById: Record<string, number> = {}; // preço não é necessário para a lista — só no detalhe do CRM
  const profile = computeCustomerProfile({ customer, vehicles, visits, orders, servicePriceById });
  const { status, reason: statusReason } = computeCustomerStatus(profile);

  const sortedVisits = [...visits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const primaryVehicle = sortedVisits[0] ? (vehicles.find((v) => v.id === sortedVisits[0].vehicleId) ?? vehicles[0] ?? null) : (vehicles[0] ?? null);

  const sortedOrders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastServiceNames = (sortedOrders[0]?.items ?? []).map((item) => catalog.get(item.serviceId) ?? "Serviço não encontrado");

  const visitIdsWithOrder = new Set(orders.map((o) => o.serviceVisitId));
  const pendingRecommendationsCount = recommendations.filter((r) => !visitIdsWithOrder.has(r.serviceVisitId)).length;

  // orderIds já restringe a busca ao próprio cliente — o filtro por data em `discountsInScope`
  // (calculado uma única vez para toda a carteira, nunca por cliente) é só uma otimização de
  // consulta, não muda o resultado por cliente.
  let lastCourtesy: CustomerOverviewEntry["lastCourtesy"] = null;
  const orderIds = new Set(orders.map((o) => o.id));
  if (orderIds.size > 0) {
    const customerDiscounts = discountsInScope
      .filter((d) => orderIds.has(d.serviceOrderId) && d.reason === "cortesia")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = customerDiscounts[0];
    if (latest) {
      lastCourtesy = { description: DISCOUNT_REASON_LABELS[latest.reason], grantedAt: latest.createdAt, amount: latest.discountAmount };
    }
  }

  return { customer, profile, status, statusReason, primaryVehicle, lastServiceNames, pendingRecommendationsCount, lastCourtesy };
}

/** Todos os clientes com perfil calculado — base para "Clientes sem retorno" e "Fidelização". Nunca paginado implicitamente. */
export async function listCustomerOverviews(): Promise<CustomerOverviewEntry[]> {
  const repo = getAttendanceRepository();
  const [customersList, catalogEntries] = await Promise.all([repo.listCustomers(), repo.listServiceCatalog()]);
  if (customersList.length === 0) return [];

  const catalog = new Map(catalogEntries.map((c) => [c.id, c.name]));
  const customerIds = customersList.map((c) => c.id);

  const [allVehicles, allVisits] = await Promise.all([repo.listVehiclesForCustomers(customerIds), repo.listVisitsForCustomers(customerIds)]);
  const visitIds = allVisits.map((v) => v.id);
  const visitToCustomerId = new Map(allVisits.map((v) => [v.id, v.customerId]));

  const [allOrders, allRecommendations] = await Promise.all([repo.listServiceOrdersForVisits(visitIds), repo.listRecommendationsForVisits(visitIds)]);

  // Uma única consulta de descontos para a carteira inteira (nunca uma por cliente) — janela
  // ancorada na visita mais antiga já buscada, mesmo espírito do `fromIso` por cliente de antes.
  let allDiscounts: Discount[] = [];
  if (allOrders.length > 0 && allVisits.length > 0) {
    const earliestVisitIso = allVisits.reduce((min, v) => (v.createdAt < min ? v.createdAt : min), allVisits[0].createdAt);
    const fromIso = saoPauloDateISO(new Date(earliestVisitIso));
    const toIso = saoPauloDateISO();
    allDiscounts = await getManagerAssistantRepository().listDiscountsInRange(fromIso, toIso);
  }

  const vehiclesByCustomer = groupBy(allVehicles, (v) => v.customerId);
  const visitsByCustomer = groupBy(allVisits, (v) => v.customerId);
  const ordersByCustomer = new Map<string, ServiceOrder[]>();
  for (const order of allOrders) {
    const customerId = visitToCustomerId.get(order.serviceVisitId);
    if (!customerId) continue;
    const list = ordersByCustomer.get(customerId) ?? [];
    list.push(order);
    ordersByCustomer.set(customerId, list);
  }
  const recommendationsByCustomer = new Map<string, TechnicalRecommendation[]>();
  for (const rec of allRecommendations) {
    const customerId = visitToCustomerId.get(rec.serviceVisitId);
    if (!customerId) continue;
    const list = recommendationsByCustomer.get(customerId) ?? [];
    list.push(rec);
    recommendationsByCustomer.set(customerId, list);
  }

  return customersList.map((customer) =>
    buildOverviewEntry(
      customer,
      catalog,
      vehiclesByCustomer.get(customer.id) ?? [],
      visitsByCustomer.get(customer.id) ?? [],
      ordersByCustomer.get(customer.id) ?? [],
      recommendationsByCustomer.get(customer.id) ?? [],
      allDiscounts,
    ),
  );
}
