import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { getManagerAssistantRepository } from "@/lib/manager-assistant/repository-factory";
import { DISCOUNT_REASON_LABELS, type Discount } from "@/lib/manager-assistant/types";
import type { Customer, ServiceOrder, ServiceVisit, Vehicle } from "@/lib/attendance/types";
import { computeCustomerProfile, computeCustomerStatus } from "@/lib/crm-intelligente/profile";
import type { CustomerProfile, CustomerStatus } from "@/lib/crm-intelligente/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Carteira completa de clientes (Missão 25) — reaproveita exatamente a mesma fonte e o mesmo
 * cálculo de perfil (`computeCustomerProfile`) usados no detalhe do CRM Inteligente, para nunca
 * haver dois números diferentes para o mesmo cliente entre a lista e o detalhe. Único ponto de
 * I/O deste arquivo: AttendanceRepository (customers/vehicles/visitas/ordens) e
 * ManagerAssistantRepository (descontos, como proxy real de "cortesia concedida").
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

async function loadOverviewEntry(customer: Customer, catalog: Map<string, string>): Promise<CustomerOverviewEntry> {
  const repo = getAttendanceRepository();
  const [vehicles, visits, orders, recommendations] = await Promise.all([
    repo.listVehiclesByCustomer(customer.id),
    repo.listVisitsByCustomer(customer.id),
    repo.listServiceOrdersByCustomer(customer.id),
    repo.listRecommendationsByCustomer(customer.id),
  ]);

  const servicePriceById: Record<string, number> = {}; // preço não é necessário para a lista — só no detalhe do CRM
  const profile = computeCustomerProfile({ customer, vehicles, visits, orders, servicePriceById });
  const { status, reason: statusReason } = computeCustomerStatus(profile);

  const sortedVisits = [...visits].sort((a: ServiceVisit, b: ServiceVisit) => b.createdAt.localeCompare(a.createdAt));
  const primaryVehicle = sortedVisits[0] ? (vehicles.find((v: Vehicle) => v.id === sortedVisits[0].vehicleId) ?? vehicles[0] ?? null) : (vehicles[0] ?? null);

  const sortedOrders = [...orders].sort((a: ServiceOrder, b: ServiceOrder) => b.createdAt.localeCompare(a.createdAt));
  const lastServiceNames = (sortedOrders[0]?.items ?? []).map((item) => catalog.get(item.serviceId) ?? "Serviço não encontrado");

  const visitIdsWithOrder = new Set(orders.map((o) => o.serviceVisitId));
  const pendingRecommendationsCount = recommendations.filter((r) => !visitIdsWithOrder.has(r.serviceVisitId)).length;

  let lastCourtesy: CustomerOverviewEntry["lastCourtesy"] = null;
  const orderIds = new Set(orders.map((o) => o.id));
  if (orderIds.size > 0) {
    const fromIso = profile.firstVisitAt ? saoPauloDateISO(new Date(profile.firstVisitAt)) : saoPauloDateISO();
    const toIso = saoPauloDateISO();
    const allDiscounts = await getManagerAssistantRepository().listDiscountsInRange(fromIso, toIso);
    const customerDiscounts = allDiscounts
      .filter((d: Discount) => orderIds.has(d.serviceOrderId) && d.reason === "cortesia")
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
  const catalog = new Map(catalogEntries.map((c) => [c.id, c.name]));
  return Promise.all(customersList.map((c) => loadOverviewEntry(c, catalog)));
}
