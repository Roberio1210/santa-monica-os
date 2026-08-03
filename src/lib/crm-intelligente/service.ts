import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { getManagerAssistantRepository } from "@/lib/manager-assistant/repository-factory";
import type { Discount } from "@/lib/manager-assistant/types";
import { looksLikePhone, looksLikePlate } from "@/lib/attendance/search";
import type { Customer, Diagnostic, ServiceOrder, ServiceVisit, Vehicle } from "@/lib/attendance/types";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import { computeCustomerProfile } from "@/lib/crm-intelligente/profile";
import { buildVehicleMemories } from "@/lib/crm-intelligente/vehicleMemory";
import { buildCrmTimeline } from "@/lib/crm-intelligente/timeline";
import { buildVehicleDiagnosticEvolution } from "@/lib/crm-intelligente/diagnosticEvolution";
import { buildActiveProtections } from "@/lib/crm-intelligente/protections";
import { buildSmartRecommendations } from "@/lib/crm-intelligente/recommendations";
import { buildCommercialHistory } from "@/lib/crm-intelligente/commercialHistory";
import { buildExecutiveSummary } from "@/lib/crm-intelligente/executiveSummary";
import { FUTURE_INTEGRATIONS_SCAFFOLD } from "@/lib/crm-intelligente/futureIntegrations";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { CrmSearchMatch, CustomerCrmDetail, VehicleCrmDetail } from "@/lib/crm-intelligente/types";

/**
 * Orquestração do CRM Inteligente — único ponto de I/O do módulo. Só leitura: compõe
 * `AttendanceRepository` (cliente, veículos, visitas, diagnósticos, recomendações, ordens,
 * catálogo) e `ManagerAssistantRepository` (descontos). Nenhuma tabela nova, nenhum mock.
 */

interface CustomerBundle {
  customer: Customer;
  vehicles: Vehicle[];
  visits: ServiceVisit[];
  diagnostics: Diagnostic[];
  orders: ServiceOrder[];
  catalog: ServiceCatalogEntry[];
  servicePriceById: Record<string, number>;
}

async function loadCustomerBundle(customer: Customer): Promise<CustomerBundle> {
  const repo = getAttendanceRepository();
  const [vehicles, visits, diagnosticsRaw, orders, catalog] = await Promise.all([
    repo.listVehiclesByCustomer(customer.id),
    repo.listVisitsByCustomer(customer.id),
    repo.listDiagnosticsByCustomer(customer.id),
    repo.listServiceOrdersByCustomer(customer.id),
    repo.listServiceCatalog(),
  ]);

  // `listDiagnosticsByCustomer` sempre traz `photos: []` — busca real por diagnóstico, mesma técnica de `fetchVehicleTimeline`.
  const photoLists = await Promise.all(diagnosticsRaw.map((d) => repo.listPhotosByDiagnostic(d.id)));
  const diagnostics = diagnosticsRaw.map((d, idx) => ({ ...d, photos: photoLists[idx] }));

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));

  return { customer, vehicles, visits, diagnostics, orders, catalog, servicePriceById };
}

async function buildSearchMatch(customer: Customer): Promise<CrmSearchMatch> {
  const bundle = await loadCustomerBundle(customer);
  const profile = computeCustomerProfile({ customer, vehicles: bundle.vehicles, visits: bundle.visits, orders: bundle.orders, servicePriceById: bundle.servicePriceById });
  return { customer, vehicles: bundle.vehicles, profile };
}

/** Busca por Nome, Telefone ou Placa — telefone/placa tentam achar um cliente exato primeiro; nome cai na busca livre (vários resultados possíveis). */
export async function searchCrm(query: string): Promise<CrmSearchMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const repo = getAttendanceRepository();

  if (looksLikePhone(trimmed)) {
    const customer = await repo.findCustomerByPhone(trimmed);
    if (customer) return [await buildSearchMatch(customer)];
  }

  if (looksLikePlate(trimmed)) {
    const vehicle = await repo.findVehicleByPlate(trimmed);
    if (vehicle) {
      const customer = await repo.getCustomer(vehicle.customerId);
      if (customer) return [await buildSearchMatch(customer)];
    }
  }

  const matches = await repo.searchCustomersByText(trimmed);
  return Promise.all(matches.map(buildSearchMatch));
}

/** Tudo que a memória do cliente precisa, numa única chamada. `null` quando o cliente não existe. */
export async function fetchCustomerCrmDetail(customerId: string): Promise<CustomerCrmDetail | null> {
  const repo = getAttendanceRepository();
  const customer = await repo.getCustomer(customerId);
  if (!customer) return null;

  const bundle = await loadCustomerBundle(customer);
  const { vehicles, visits, diagnostics, orders, catalog, servicePriceById } = bundle;

  const profile = computeCustomerProfile({ customer, vehicles, visits, orders, servicePriceById });

  const orderIds = new Set(orders.map((o) => o.id));
  let discounts: Discount[] = [];
  if (orders.length > 0) {
    const fromIso = profile.firstVisitAt ? saoPauloDateISO(new Date(profile.firstVisitAt)) : saoPauloDateISO();
    const toIso = saoPauloDateISO();
    const allDiscounts = await getManagerAssistantRepository().listDiscountsInRange(fromIso, toIso);
    discounts = allDiscounts.filter((d) => orderIds.has(d.serviceOrderId));
  }

  const recommendations = await repo.listRecommendationsByCustomer(customer.id);
  const timeline = buildCrmTimeline({ visits, diagnostics, recommendations, orders, discounts });

  const vehicleMemories = buildVehicleMemories(vehicles, visits);

  const vehicleDetails: VehicleCrmDetail[] = vehicleMemories.map((memory) => {
    const vehicleTimeline = timeline.filter((entry) => entry.vehicleId === memory.vehicle.id);

    const vehicleVisitIds = new Set(visits.filter((v) => v.vehicleId === memory.vehicle.id).map((v) => v.id));
    const vehicleDiagnostics = diagnostics.filter((d) => vehicleVisitIds.has(d.serviceVisitId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latestDiagnostic = vehicleDiagnostics[0] ?? null;

    return {
      vehicle: memory.vehicle,
      memory,
      timeline: vehicleTimeline,
      diagnosticEvolution: buildVehicleDiagnosticEvolution({ vehicleId: memory.vehicle.id, visits, diagnostics }),
      activeProtections: buildActiveProtections({ timeline: vehicleTimeline }),
      recommendations: buildSmartRecommendations({ latestDiagnostic, timeline: vehicleTimeline }),
    };
  });

  const executiveSummary = buildExecutiveSummary({
    profile,
    activeProtectionsCount: vehicleDetails.reduce((sum, v) => sum + v.activeProtections.length, 0),
    recommendations: vehicleDetails.flatMap((v) => v.recommendations),
  });

  const commercialHistory = buildCommercialHistory({ orders, catalog });

  return {
    customer,
    profile,
    executiveSummary,
    vehicles: vehicleDetails,
    timeline,
    commercialHistory,
    integrations: FUTURE_INTEGRATIONS_SCAFFOLD,
  };
}
