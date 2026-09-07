import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import type { Customer, Vehicle } from "@/lib/attendance/types";
import { fetchOrdersByIds, type JumpParkServiceOrderRow } from "@/lib/integrations/jumppark/ordersQuery";
import type { PlateConflictExistingVehicle, PlateConflictReviewViewModel } from "@/lib/integrations/jumppark/plateConflictEvidence";
import type { AppointmentRow } from "@/lib/planning/repository";
import { getPlanningRepository } from "@/lib/planning/repository-factory";

/**
 * Missão 19 (Etapa C do design da Missão 16) — enriquecimento READ-ONLY do
 * `PlateConflictReviewViewModel` (Missão 18) com dados atuais de vehicle/customer/appointment e
 * contexto incoming JumpPark recuperado localmente por `incomingOrderIds`. Camada separada de
 * propósito: o parser da Missão 18 (`plateConflictEvidence.ts`) permanece puro (sem `db`, sem
 * I/O) — só esta camada faz consultas, e só leitura (nenhum `insert`/`update`/`delete`, nenhuma
 * chamada à API da JumpPark, nenhum sync).
 *
 * N+1: todas as buscas são em lote (`getVehiclesByIds`, `getCustomersByIds`,
 * `getRelevantAppointmentsByVehicleIds`, `fetchOrdersByIds`) — uma consulta por tipo de entidade
 * para TODOS os `viewModels` recebidos de uma vez, nunca uma consulta por candidato.
 */

/** Estados considerados "relevantes" para decidir o agendamento mais próximo — nunca `cancelado` nem `concluido` (ver `getRelevantAppointmentsByVehicleIds`, que já filtra isso no banco; o filtro aqui é defesa adicional, não a fonte da verdade). */
const RELEVANT_APPOINTMENT_STATUSES = new Set(["agendado", "confirmado", "em_andamento", "reagendado"]);

export interface EnrichedAppointment {
  id: string;
  scheduledAt: string;
  status: string;
  serviceId: string;
  serviceName: string;
}

export interface EnrichedCustomer {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface EnrichedExistingVehicle {
  vehicleId: string;
  /** `true` quando o vehicle não foi encontrado (removido, ou id inconsistente) — dados abaixo ficam `null`, nunca inventados. */
  unavailable: boolean;
  source: string | null;
  plate: string | null;
  model: string | null;
  brand: string | null;
  color: string | null;
  customer: EnrichedCustomer | null;
  /** Agendamento futuro/atual não cancelado mais próximo deste vehicle — `null` quando não há nenhum. */
  appointment: EnrichedAppointment | null;
}

export interface EnrichedIncomingOrder {
  orderId: string;
  /** `true` quando a ordem não foi encontrada em `jumppark_service_orders` — demais campos ficam `null`. */
  unavailable: boolean;
  externalId: string | null;
  orderDate: string | null;
  plateMasked: string | null;
  vehicleModel: string | null;
  clientName: string | null;
  clientPhoneMasked: string | null;
}

/**
 * Substitui `existingVehicles` (estrutural, Missão 18) por sua versão enriquecida e adiciona
 * `incomingOrders` — resto dos campos do ViewModel base preservado sem alteração.
 */
export interface EnrichedPlateConflictReviewViewModel extends Omit<PlateConflictReviewViewModel, "existingVehicles"> {
  existingVehicles: EnrichedExistingVehicle[];
  incomingOrders: EnrichedIncomingOrder[];
}

function pickNearestAppointment(rows: AppointmentRow[]): AppointmentRow | null {
  const eligible = rows.filter((r) => RELEVANT_APPOINTMENT_STATUSES.has(r.status));
  if (eligible.length === 0) return null;
  const inProgress = eligible.find((r) => r.status === "em_andamento");
  if (inProgress) return inProgress;
  return [...eligible].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null;
}

function toEnrichedAppointment(row: AppointmentRow): EnrichedAppointment {
  return { id: row.id, scheduledAt: row.scheduledAt, status: row.status, serviceId: row.serviceId, serviceName: row.serviceName };
}

function toEnrichedCustomer(row: Customer): EnrichedCustomer {
  return { id: row.id, name: row.name, phone: row.phone };
}

function toEnrichedOrder(orderId: string, row: JumpParkServiceOrderRow | undefined): EnrichedIncomingOrder {
  if (!row) {
    return { orderId, unavailable: true, externalId: null, orderDate: null, plateMasked: null, vehicleModel: null, clientName: null, clientPhoneMasked: null };
  }
  return {
    orderId,
    unavailable: false,
    externalId: row.externalId,
    orderDate: row.orderDate,
    plateMasked: row.plateMasked,
    vehicleModel: row.vehicleModel,
    clientName: row.clientName,
    clientPhoneMasked: row.clientPhoneMasked,
  };
}

/**
 * Enriquece um lote de `PlateConflictReviewViewModel` de uma vez (mesmo item de revisão pode
 * aparecer só uma vez, ou vários itens de uma fila) — busca tudo em lote, nunca N+1. Não acessa
 * banco para escrever, não chama a API da JumpPark, não roda sync.
 */
export async function enrichPlateConflictReviewItems(viewModels: PlateConflictReviewViewModel[]): Promise<EnrichedPlateConflictReviewViewModel[]> {
  if (viewModels.length === 0) return [];

  const vehicleIds = Array.from(new Set(viewModels.flatMap((vm) => vm.existingVehicles.map((v) => v.vehicleId))));
  const orderIds = Array.from(new Set(viewModels.flatMap((vm) => vm.incomingOrderIds)));

  const attendanceRepo = getAttendanceRepository();
  const planningRepo = getPlanningRepository();
  const nowIso = new Date().toISOString();

  const [vehicleRows, appointmentRows, orderRows] = await Promise.all([
    attendanceRepo.getVehiclesByIds(vehicleIds),
    planningRepo.getRelevantAppointmentsByVehicleIds(vehicleIds, nowIso),
    fetchOrdersByIds(orderIds),
  ]);

  const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));

  const structuralCustomerIds = viewModels.flatMap((vm) => vm.existingVehicles.map((v) => v.customerId).filter((id): id is string => !!id));
  const foundVehicleCustomerIds = vehicleRows.map((v) => v.customerId);
  const customerIds = Array.from(new Set([...structuralCustomerIds, ...foundVehicleCustomerIds]));
  const customerRows = await attendanceRepo.getCustomersByIds(customerIds);
  const customerById = new Map(customerRows.map((c) => [c.id, c]));

  const appointmentsByVehicleId = new Map<string, AppointmentRow[]>();
  for (const row of appointmentRows) {
    const bucket = appointmentsByVehicleId.get(row.vehicleId) ?? [];
    bucket.push(row);
    appointmentsByVehicleId.set(row.vehicleId, bucket);
  }
  const nearestAppointmentByVehicleId = new Map<string, AppointmentRow | null>();
  for (const vehicleId of vehicleIds) {
    nearestAppointmentByVehicleId.set(vehicleId, pickNearestAppointment(appointmentsByVehicleId.get(vehicleId) ?? []));
  }

  const orderById = new Map(orderRows.map((o) => [o.id, o]));

  function enrichExistingVehicle(entry: PlateConflictExistingVehicle): EnrichedExistingVehicle {
    const vehicle: Vehicle | undefined = vehicleById.get(entry.vehicleId);
    const customerId = vehicle?.customerId ?? entry.customerId;
    const customer = customerId ? (customerById.get(customerId) ?? null) : null;
    const nearestAppointment = nearestAppointmentByVehicleId.get(entry.vehicleId) ?? null;
    return {
      vehicleId: entry.vehicleId,
      unavailable: !vehicle,
      source: vehicle?.source ?? entry.source ?? null,
      plate: vehicle?.plate ?? null,
      model: vehicle?.model ?? null,
      brand: vehicle?.brand ?? null,
      color: vehicle?.color ?? null,
      customer: customer ? toEnrichedCustomer(customer) : null,
      appointment: nearestAppointment ? toEnrichedAppointment(nearestAppointment) : null,
    };
  }

  return viewModels.map((vm) => ({
    ...vm,
    existingVehicles: vm.existingVehicles.map(enrichExistingVehicle),
    incomingOrders: vm.incomingOrderIds.map((orderId) => toEnrichedOrder(orderId, orderById.get(orderId))),
  }));
}

/** Conveniência para enriquecer um único item — delega para `enrichPlateConflictReviewItems`. */
export async function enrichPlateConflictReviewItem(viewModel: PlateConflictReviewViewModel): Promise<EnrichedPlateConflictReviewViewModel> {
  const [result] = await enrichPlateConflictReviewItems([viewModel]);
  return result;
}
