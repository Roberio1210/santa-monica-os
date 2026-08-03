import { randomUUID } from "node:crypto";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import type { AppointmentRow, CompletedOrderSample, PlanningRepository } from "@/lib/planning/repository";
import type { Appointment, AppointmentStatus, CapacityConfig, CreateAppointmentInput, SetCapacityConfigInput } from "@/lib/planning/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Implementação em memória — mesmo papel de `MemoryAttendanceRepository`, só para desenvolvimento
 * sem Postgres. Resolve nome/telefone/veículo/serviço chamando `getAttendanceRepository()`
 * (mesma instância em cache) em vez de duplicar dados de cliente/veículo/catálogo aqui.
 */
export class MemoryPlanningRepository implements PlanningRepository {
  private appointments = new Map<string, Appointment>();
  private capacityConfigs: CapacityConfig[] = [];

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
}
