import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import { summarizeCustomerHistory } from "@/lib/attendance/history";
import { looksLikePhone, looksLikePlate } from "@/lib/attendance/search";
import { SERVICE_ORDER_STATUSES, type Customer, type CustomerHistorySummary, type Diagnostic, type ExteriorAssessment, type InteriorAssessment, type ManagerBoardColumn, type ManagerBoardOrder, type ServiceOrder, type ServiceOrderStatus, type ServiceVisit, type TechnicalRecommendation, type Vehicle, SERVICE_ORDER_STATUS_LABELS } from "@/lib/attendance/types";
import { nextStatus } from "@/lib/attendance/status";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Orquestração do Atendimento Inteligente — único ponto de I/O do módulo. Toda lógica pura
 * (histórico, status, catálogos) vive em módulos sem I/O e é sempre reaproveitada daqui, nunca
 * duplicada.
 */

export interface SearchResult {
  customer: Customer;
  vehicles: Vehicle[];
  matchedVehicleId: string | null;
  history: CustomerHistorySummary;
}

async function buildHistory(customer: Customer): Promise<CustomerHistorySummary> {
  const repo = getAttendanceRepository();
  const [vehicles, visits, diagnostics, recommendations, orders, catalog] = await Promise.all([
    repo.listVehiclesByCustomer(customer.id),
    repo.listVisitsByCustomer(customer.id),
    repo.listDiagnosticsByCustomer(customer.id),
    repo.listRecommendationsByCustomer(customer.id),
    repo.listServiceOrdersByCustomer(customer.id),
    repo.listServiceCatalog(),
  ]);

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));

  return summarizeCustomerHistory({ customer, vehicles, visits, diagnostics, recommendations, orders, servicePriceById });
}

/** Busca automática por telefone ou placa — nunca inventa correspondência parcial. */
export async function searchByPhoneOrPlate(query: string): Promise<SearchResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const repo = getAttendanceRepository();

  if (looksLikePhone(trimmed)) {
    const customer = await repo.findCustomerByPhone(trimmed);
    if (customer) {
      const history = await buildHistory(customer);
      return { customer, vehicles: history.vehicles, matchedVehicleId: null, history };
    }
  }

  if (looksLikePlate(trimmed)) {
    const vehicle = await repo.findVehicleByPlate(trimmed);
    if (vehicle) {
      const customer = await repo.getCustomer(vehicle.customerId);
      if (customer) {
        const history = await buildHistory(customer);
        return { customer, vehicles: history.vehicles, matchedVehicleId: vehicle.id, history };
      }
    }
  }

  return null;
}

export interface QuickRegisterInput {
  customerName: string;
  customerPhone: string;
  customerCpf?: string | null;
  vehiclePlate: string;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  vehicleColor?: string | null;
}

/** Cadastro rápido — nunca duplica cliente/veículo já existente por telefone/placa. */
export async function registerQuickCustomerAndVehicle(input: QuickRegisterInput): Promise<{ customer: Customer; vehicle: Vehicle }> {
  const repo = getAttendanceRepository();

  const existingCustomer = await repo.findCustomerByPhone(input.customerPhone);
  const customer = existingCustomer ?? (await repo.createCustomer({ name: input.customerName, phone: input.customerPhone, cpf: input.customerCpf ?? null }));

  const existingVehicle = await repo.findVehicleByPlate(input.vehiclePlate);
  const vehicle =
    existingVehicle && existingVehicle.customerId === customer.id
      ? existingVehicle
      : await repo.createVehicle({
          customerId: customer.id,
          plate: input.vehiclePlate,
          brand: input.vehicleBrand ?? null,
          model: input.vehicleModel ?? null,
          year: input.vehicleYear ?? null,
          color: input.vehicleColor ?? null,
        });

  return { customer, vehicle };
}

export async function startAttendance(customerId: string, vehicleId: string, mileageAtVisit: number | null): Promise<ServiceVisit> {
  return getAttendanceRepository().createServiceVisit({ customerId, vehicleId, mileageAtVisit });
}

export async function fetchServiceVisitContext(serviceVisitId: string): Promise<{
  visit: ServiceVisit;
  customer: Customer;
  vehicle: Vehicle;
  diagnostic: Diagnostic | null;
  recommendations: TechnicalRecommendation[];
  order: ServiceOrder | null;
} | null> {
  const repo = getAttendanceRepository();
  const visit = await repo.getServiceVisit(serviceVisitId);
  if (!visit) return null;

  const [customer, vehicle, diagnostic, recommendations, order] = await Promise.all([
    repo.getCustomer(visit.customerId),
    repo.getVehicle(visit.vehicleId),
    repo.getDiagnosticByVisit(serviceVisitId),
    repo.listRecommendationsByVisit(serviceVisitId),
    repo.getServiceOrderByVisit(serviceVisitId),
  ]);
  if (!customer || !vehicle) return null;

  return { visit, customer, vehicle, diagnostic, recommendations, order };
}

export async function saveDiagnosticStep(serviceVisitId: string, exterior: ExteriorAssessment, interior: InteriorAssessment, observations: string | null): Promise<Diagnostic> {
  return getAttendanceRepository().saveDiagnostic({ serviceVisitId, exterior, interior, observations });
}

export async function addTechnicalRecommendation(serviceVisitId: string, category: string, observations: string | null): Promise<TechnicalRecommendation> {
  return getAttendanceRepository().addRecommendation({ serviceVisitId, category, observations });
}

/** Nunca cria Ordem de Serviço sem ao menos um serviço aprovado. */
export async function createServiceOrderFromApprovedServices(serviceVisitId: string, serviceIds: string[]): Promise<ServiceOrder> {
  if (serviceIds.length === 0) {
    throw new Error("Selecione ao menos um serviço aprovado para criar a Ordem de Serviço.");
  }
  return getAttendanceRepository().createServiceOrder({ serviceVisitId, serviceIds });
}

export async function advanceServiceOrderStatus(serviceOrderId: string, currentStatus: ServiceOrderStatus): Promise<ServiceOrder> {
  const next = nextStatus(currentStatus);
  if (!next) throw new Error("Esta Ordem de Serviço já está no status final (Entregue).");
  return getAttendanceRepository().updateServiceOrderStatus(serviceOrderId, next);
}

export async function setServiceOrderStatus(serviceOrderId: string, status: ServiceOrderStatus): Promise<ServiceOrder> {
  return getAttendanceRepository().updateServiceOrderStatus(serviceOrderId, status);
}

export async function fetchServiceCatalog(): Promise<ServiceCatalogEntry[]> {
  return getAttendanceRepository().listServiceCatalog();
}

export interface ManagerBoard {
  columns: ManagerBoardColumn[];
  deliveredToday: ManagerBoardOrder[];
}

const BOARD_STATUSES: ServiceOrderStatus[] = SERVICE_ORDER_STATUSES.filter((s) => s !== "entregue");

/** Painel do Gerente — operacional, sem gráficos. Carros agrupados por status + entregues hoje. */
export async function fetchManagerBoard(): Promise<ManagerBoard> {
  const repo = getAttendanceRepository();
  const today = saoPauloDateISO();
  const [active, deliveredToday] = await Promise.all([repo.listBoardOrders(), repo.listDeliveredOnDate(today)]);

  const columns: ManagerBoardColumn[] = BOARD_STATUSES.map((status) => ({
    status,
    label: SERVICE_ORDER_STATUS_LABELS[status],
    orders: active.filter((o) => o.status === status).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
  }));

  return { columns, deliveredToday };
}
