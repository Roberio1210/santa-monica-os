import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { appointments, customers, operationalCapacityConfig, serviceOrderItems, serviceOrders, services, serviceVisits, vehicles } from "@/db/schema";
import type { AppointmentRow, CompletedOrderSample, PlanningRepository } from "@/lib/planning/repository";
import type { Appointment, AppointmentStatus, CapacityConfig, CreateAppointmentInput, SetCapacityConfigInput } from "@/lib/planning/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/** Missão 19 — ver docstring de `getRelevantAppointmentsByVehicleIds` em `repository.ts`. */
const RELEVANT_APPOINTMENT_STATUSES: AppointmentStatus[] = ["agendado", "confirmado", "em_andamento", "reagendado"];

function toAppointment(row: typeof appointments.$inferSelect): Appointment {
  return {
    id: row.id,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    serviceId: row.serviceId,
    scheduledAt: row.scheduledAt.toISOString(),
    expectedDurationMinutes: row.expectedDurationMinutes,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCapacityConfig(row: typeof operationalCapacityConfig.$inferSelect): CapacityConfig {
  return { id: row.id, boxesCount: row.boxesCount, dailyOperatingMinutes: row.dailyOperatingMinutes };
}

/** Implementação real, ativada automaticamente quando DATABASE_URL está configurada (ver repository-factory.ts). */
export class PostgresPlanningRepository implements PlanningRepository {
  private db() {
    const db = getDb();
    if (!db) {
      throw new Error("PostgresPlanningRepository foi instanciado sem DATABASE_URL configurada — bug em repository-factory.ts.");
    }
    return db;
  }

  async createAppointment(input: CreateAppointmentInput, runner: DbOrTx = this.db()): Promise<Appointment> {
    const [row] = await runner
      .insert(appointments)
      .values({
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        serviceId: input.serviceId,
        scheduledAt: new Date(input.scheduledAt),
        expectedDurationMinutes: input.expectedDurationMinutes,
        status: "agendado",
        notes: input.notes ?? null,
        source: "manual",
      })
      .returning();
    return toAppointment(row);
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const [row] = await this.db().select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return row ? toAppointment(row) : null;
  }

  private rowSelect() {
    return this.db()
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        status: appointments.status,
        customerId: customers.id,
        customerName: customers.name,
        phone: customers.phone,
        vehicleId: vehicles.id,
        vehicleBrand: vehicles.brand,
        vehicleModel: vehicles.model,
        plate: vehicles.plate,
        serviceId: services.id,
        serviceName: services.name,
        expectedDurationMinutes: appointments.expectedDurationMinutes,
        notes: appointments.notes,
        updatedAt: appointments.updatedAt,
      })
      .from(appointments)
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .innerJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .innerJoin(services, eq(appointments.serviceId, services.id));
  }

  private toRow(row: Awaited<ReturnType<PostgresPlanningRepository["rowSelect"]>>[number]): AppointmentRow {
    return {
      id: row.id,
      scheduledAt: row.scheduledAt.toISOString(),
      status: row.status,
      customerId: row.customerId,
      customerName: row.customerName,
      phone: row.phone,
      vehicleId: row.vehicleId,
      vehicleLabel: [row.vehicleBrand, row.vehicleModel].filter(Boolean).join(" ") || "Veículo",
      plate: row.plate,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      expectedDurationMinutes: row.expectedDurationMinutes,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listAppointmentsInRange(fromIso: string, toIso: string): Promise<AppointmentRow[]> {
    const rows = await this.rowSelect().orderBy(appointments.scheduledAt);
    const inRange = rows.filter((r) => {
      const day = saoPauloDateISO(r.scheduledAt);
      return day >= fromIso && day <= toIso;
    });
    return inRange.map((r) => this.toRow(r));
  }

  async listUpcoming(fromIso: string): Promise<AppointmentRow[]> {
    const rows = await this.rowSelect().orderBy(appointments.scheduledAt);
    const upcoming = rows.filter((r) => saoPauloDateISO(r.scheduledAt) >= fromIso);
    return upcoming.map((r) => this.toRow(r));
  }

  async getRelevantAppointmentsByVehicleIds(vehicleIds: string[], nowIso: string): Promise<AppointmentRow[]> {
    if (vehicleIds.length === 0) return [];
    const rows = await this.rowSelect()
      .where(and(inArray(appointments.vehicleId, vehicleIds), inArray(appointments.status, RELEVANT_APPOINTMENT_STATUSES)))
      .orderBy(appointments.scheduledAt);
    const now = new Date(nowIso);
    const relevant = rows.filter((r) => r.status === "em_andamento" || r.scheduledAt >= now);
    return relevant.map((r) => this.toRow(r));
  }

  async searchAppointments(query: string, fromIso: string): Promise<AppointmentRow[]> {
    const needle = query.trim();
    if (needle.length < 2) return [];
    const pattern = `%${needle}%`;
    const rows = await this.rowSelect()
      .where(or(ilike(customers.name, pattern), ilike(customers.phone, pattern), ilike(vehicles.plate, pattern), ilike(vehicles.brand, pattern), ilike(vehicles.model, pattern)))
      .orderBy(appointments.scheduledAt);
    const upcoming = rows.filter((r) => saoPauloDateISO(r.scheduledAt) >= fromIso);
    return upcoming.map((r) => this.toRow(r));
  }

  async updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    const [row] = await this.db().update(appointments).set({ status, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
    if (!row) throw new Error(`Agendamento ${id} não encontrado.`);
    return toAppointment(row);
  }

  /**
   * Missão 48 — ver docstring em `repository.ts`. `WHERE ... AND updated_at = expectedUpdatedAt` é
   * o próprio CAS: 0 linhas = não encontrado ou já alterado por outra operação.
   *
   * Missão 49 (Parte C, bug real encontrado na revisão) — `updated_at` é `timestamp(withTimezone)`
   * SEM precisão limitada no schema, então um `updatedAt` que ainda carrega o valor original de
   * `defaultNow()` (função `now()` do Postgres, precisão de microssegundos) tem dígitos que um
   * `Date` do JS NUNCA consegue representar (só milissegundos) — o cliente só recebe/reenvia a
   * versão truncada, então uma comparação direta (`eq`) quase sempre dava falso-negativo no
   * PRIMEIRO edit de qualquer agendamento nunca antes tocado por `updateAppointmentStatus` (que já
   * escreve `updatedAt` via `new Date()`, sempre em milissegundos). `date_trunc('milliseconds', ...)`
   * nivela os dois lados na mesma precisão que o cliente realmente enxerga — corrige tanto para
   * linhas novas quanto para linhas antigas, sem tocar em nenhum dado existente.
   */
  async updateAppointmentDetails(
    id: string,
    fields: { serviceId: string; scheduledAt: string; expectedDurationMinutes: number; notes: string | null },
    expectedUpdatedAt: string,
  ): Promise<Appointment | null> {
    const [row] = await this.db()
      .update(appointments)
      .set({
        serviceId: fields.serviceId,
        scheduledAt: new Date(fields.scheduledAt),
        expectedDurationMinutes: fields.expectedDurationMinutes,
        notes: fields.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(appointments.id, id), sql`date_trunc('milliseconds', ${appointments.updatedAt}) = ${expectedUpdatedAt}::timestamptz`))
      .returning();
    return row ? toAppointment(row) : null;
  }

  async getActiveCapacityConfig(): Promise<CapacityConfig | null> {
    const [row] = await this.db().select().from(operationalCapacityConfig).where(eq(operationalCapacityConfig.active, true)).orderBy(desc(operationalCapacityConfig.createdAt)).limit(1);
    return row ? toCapacityConfig(row) : null;
  }

  async setCapacityConfig(input: SetCapacityConfigInput): Promise<CapacityConfig> {
    await this.db().update(operationalCapacityConfig).set({ active: false, updatedAt: new Date() }).where(eq(operationalCapacityConfig.active, true));
    const [row] = await this.db()
      .insert(operationalCapacityConfig)
      .values({ boxesCount: input.boxesCount, dailyOperatingMinutes: input.dailyOperatingMinutes, source: "manual" })
      .returning();
    return toCapacityConfig(row);
  }

  async listCompletedSingleServiceOrders(): Promise<CompletedOrderSample[]> {
    const orderRows = await this.db()
      .select({ orderId: serviceOrders.id, updatedAt: serviceOrders.updatedAt, visitCreatedAt: serviceVisits.createdAt })
      .from(serviceOrders)
      .innerJoin(serviceVisits, eq(serviceOrders.serviceVisitId, serviceVisits.id))
      .where(eq(serviceOrders.status, "entregue"));
    if (orderRows.length === 0) return [];

    const itemRows = await this.db()
      .select({ orderId: serviceOrderItems.serviceOrderId, serviceName: services.name })
      .from(serviceOrderItems)
      .innerJoin(services, eq(serviceOrderItems.serviceId, services.id))
      .where(
        inArray(
          serviceOrderItems.serviceOrderId,
          orderRows.map((o) => o.orderId),
        ),
      );

    const namesByOrder = new Map<string, string[]>();
    for (const item of itemRows) {
      const list = namesByOrder.get(item.orderId) ?? [];
      list.push(item.serviceName);
      namesByOrder.set(item.orderId, list);
    }

    return orderRows
      .map((o) => ({ serviceNames: namesByOrder.get(o.orderId) ?? [], visitCreatedAt: o.visitCreatedAt.toISOString(), updatedAt: o.updatedAt.toISOString() }))
      .filter((o) => o.serviceNames.length === 1);
  }

  async getServiceEstimatedDurations(serviceIds: string[]): Promise<Record<string, number | null>> {
    if (serviceIds.length === 0) return {};
    const rows = await this.db()
      .select({ id: services.id, estimatedDurationMinutes: services.estimatedDurationMinutes })
      .from(services)
      .where(inArray(services.id, serviceIds));
    const result: Record<string, number | null> = {};
    for (const row of rows) result[row.id] = row.estimatedDurationMinutes;
    return result;
  }

  /** Missão 49 — ver docstring em `repository.ts`. */
  async getService(serviceId: string): Promise<{ id: string; active: boolean; estimatedDurationMinutes: number | null } | null> {
    const [row] = await this.db()
      .select({ id: services.id, active: services.active, estimatedDurationMinutes: services.estimatedDurationMinutes })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    return row ?? null;
  }
}
