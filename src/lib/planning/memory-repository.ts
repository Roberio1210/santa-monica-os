import { randomUUID } from "node:crypto";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import type { AppointmentRow, CompletedOrderSample, PlanningRepository } from "@/lib/planning/repository";
import type { Appointment, AppointmentStatus, CapacityConfig, CreateAppointmentInput, SetCapacityConfigInput } from "@/lib/planning/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

function nowIso(): string {
  return new Date().toISOString();
}

/** Mesma lista de `RELEVANT_APPOINTMENT_STATUSES` de `postgres-repository.ts` — ver docstring de `getRelevantAppointmentsByVehicleIds` em `repository.ts`. */
const RELEVANT_APPOINTMENT_STATUSES = new Set<AppointmentStatus>(["agendado", "confirmado", "em_andamento", "reagendado"]);

/**
 * Implementação em memória — mesmo papel de `MemoryAttendanceRepository`, só para desenvolvimento
 * sem Postgres. Resolve nome/telefone/veículo/serviço chamando `getAttendanceRepository()`
 * (mesma instância em cache) em vez de duplicar dados de cliente/veículo/catálogo aqui.
 */
export class MemoryPlanningRepository implements PlanningRepository {
  private appointments = new Map<string, Appointment>();
  private capacityConfigs: CapacityConfig[] = [];
  private serviceDurations = new Map<string, number | null>();
  private inactiveServiceIds = new Set<string>();

  async createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
    const appointment: Appointment = {
      id: randomUUID(),
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      serviceId: input.serviceId,
      scheduledAt: input.scheduledAt,
      expectedDurationMinutes: input.expectedDurationMinutes,
      status: "agendado",
      notes: input.notes ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.appointments.set(appointment.id, appointment);
    return appointment;
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    return this.appointments.get(id) ?? null;
  }

  private async toRow(appointment: Appointment): Promise<AppointmentRow> {
    const repo = getAttendanceRepository();
    const [customer, vehicle, catalog] = await Promise.all([repo.getCustomer(appointment.customerId), repo.getVehicle(appointment.vehicleId), repo.listServiceCatalog()]);
    const service = catalog.find((s) => s.id === appointment.serviceId);
    const vehicleLabel = vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo" : "Veículo";
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      customerId: appointment.customerId,
      customerName: customer?.name ?? null,
      phone: customer?.phone ?? null,
      vehicleId: appointment.vehicleId,
      vehicleLabel,
      plate: vehicle?.plate ?? null,
      serviceId: appointment.serviceId,
      serviceName: service?.name ?? "Serviço",
      expectedDurationMinutes: appointment.expectedDurationMinutes,
      notes: appointment.notes,
      updatedAt: appointment.updatedAt,
    };
  }

  async listAppointmentsInRange(fromIso: string, toIso: string): Promise<AppointmentRow[]> {
    const inRange = Array.from(this.appointments.values()).filter((a) => {
      const day = saoPauloDateISO(new Date(a.scheduledAt));
      return day >= fromIso && day <= toIso;
    });
    return Promise.all(inRange.map((a) => this.toRow(a)));
  }

  async listUpcoming(fromIso: string): Promise<AppointmentRow[]> {
    const upcoming = Array.from(this.appointments.values()).filter((a) => saoPauloDateISO(new Date(a.scheduledAt)) >= fromIso);
    return Promise.all(upcoming.map((a) => this.toRow(a)));
  }

  async getRelevantAppointmentsByVehicleIds(vehicleIds: string[], nowIso: string): Promise<AppointmentRow[]> {
    const ids = new Set(vehicleIds);
    const now = new Date(nowIso);
    const relevant = Array.from(this.appointments.values()).filter(
      (a) => ids.has(a.vehicleId) && RELEVANT_APPOINTMENT_STATUSES.has(a.status) && (a.status === "em_andamento" || new Date(a.scheduledAt) >= now),
    );
    relevant.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return Promise.all(relevant.map((a) => this.toRow(a)));
  }

  async searchAppointments(query: string, fromIso: string): Promise<AppointmentRow[]> {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const rows = await this.listUpcoming(fromIso);
    return rows.filter(
      (r) =>
        (r.customerName?.toLowerCase().includes(needle) ?? false) ||
        (r.phone?.toLowerCase().includes(needle) ?? false) ||
        (r.plate?.toLowerCase().includes(needle) ?? false) ||
        r.vehicleLabel.toLowerCase().includes(needle),
    );
  }

  async updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    const appointment = this.appointments.get(id);
    if (!appointment) throw new Error(`Agendamento ${id} não encontrado.`);
    const updated: Appointment = { ...appointment, status, updatedAt: nowIso() };
    this.appointments.set(id, updated);
    return updated;
  }

  /** Missão 48 — mesmo CAS de `PostgresPlanningRepository.updateAppointmentDetails`: `null` quando não encontrado ou `expectedUpdatedAt` não bate mais com o valor atual. */
  async updateAppointmentDetails(
    id: string,
    fields: { serviceId: string; scheduledAt: string; expectedDurationMinutes: number; notes: string | null },
    expectedUpdatedAt: string,
  ): Promise<Appointment | null> {
    const appointment = this.appointments.get(id);
    if (!appointment || appointment.updatedAt !== expectedUpdatedAt) return null;
    const updated: Appointment = {
      ...appointment,
      serviceId: fields.serviceId,
      scheduledAt: fields.scheduledAt,
      expectedDurationMinutes: fields.expectedDurationMinutes,
      notes: fields.notes,
      updatedAt: nowIso(),
    };
    this.appointments.set(id, updated);
    return updated;
  }

  async getActiveCapacityConfig(): Promise<CapacityConfig | null> {
    return this.capacityConfigs[this.capacityConfigs.length - 1] ?? null;
  }

  async setCapacityConfig(input: SetCapacityConfigInput): Promise<CapacityConfig> {
    const config: CapacityConfig = { id: randomUUID(), boxesCount: input.boxesCount, dailyOperatingMinutes: input.dailyOperatingMinutes };
    this.capacityConfigs.push(config);
    return config;
  }

  /** Modo memória não mantém um índice de todas as ordens entregues (só por cliente/dia) — Previsão fica sempre "não calculável" em desenvolvimento, comportamento aceitável pois memória nunca é usada em produção. */
  async listCompletedSingleServiceOrders(): Promise<CompletedOrderSample[]> {
    return [];
  }

  /**
   * Missão 3.1 — o catálogo de serviços em memória (`ServiceCatalogEntry`) não carrega
   * `estimatedDurationMinutes`; mesmo espírito de `listCompletedSingleServiceOrders` acima —
   * mapa vazio (nunca inventa duração) SALVO para os ids explicitamente semeados via
   * `setServiceEstimatedDurationForTesting` (Missão 48) — nunca um valor implícito/adivinhado.
   */
  async getServiceEstimatedDurations(serviceIds: string[]): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = {};
    for (const id of serviceIds) {
      if (this.serviceDurations.has(id)) result[id] = this.serviceDurations.get(id) ?? null;
    }
    return result;
  }

  /**
   * Missão 48 — método de TESTE, fora da interface `PlanningRepository` (produção/Postgres sempre
   * lê o valor real de `services.estimated_duration_minutes`, nunca isto). Só existe porque o
   * repositório em memória não tem um catálogo real com duração — sem isso, nenhum teste de
   * `updateAppointmentDetails` conseguiria exercitar o caminho de sucesso (duração sempre viria
   * `null`, bloqueando toda edição). `minutes: null` simula um serviço real sem duração cadastrada.
   */
  setServiceEstimatedDurationForTesting(serviceId: string, minutes: number | null): void {
    this.serviceDurations.set(serviceId, minutes);
  }

  /** Missão 49 — ver docstring em `repository.ts`. `null` = id não existe no catálogo (nem em memória, nem hipoteticamente em produção). */
  async getService(serviceId: string): Promise<{ id: string; active: boolean; estimatedDurationMinutes: number | null } | null> {
    const catalog = await getAttendanceRepository().listServiceCatalog();
    const found = catalog.find((s) => s.id === serviceId);
    if (!found) return null;
    return { id: found.id, active: !this.inactiveServiceIds.has(serviceId), estimatedDurationMinutes: this.serviceDurations.get(serviceId) ?? null };
  }

  /**
   * Missão 49 — método de TESTE, mesmo espírito de `setServiceEstimatedDurationForTesting`: o
   * catálogo em memória não modela serviço inativo (produção/Postgres sempre lê `services.active`
   * real). Sem isso, não haveria como testar "serviço inativo bloqueado" fora do Postgres.
   */
  setServiceActiveForTesting(serviceId: string, active: boolean): void {
    if (active) this.inactiveServiceIds.delete(serviceId);
    else this.inactiveServiceIds.add(serviceId);
  }
}
