import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, diagnostics, serviceOrderItems, serviceOrders, serviceVisits, services, technicalRecommendations, vehicles } from "@/db/schema";
import type { AttendanceRepository, ServiceCatalogEntry } from "@/lib/attendance/repository";
import type {
  AddRecommendationInput,
  CreateCustomerInput,
  CreateServiceOrderInput,
  CreateVehicleInput,
  Customer,
  Diagnostic,
  ExteriorAssessment,
  InteriorAssessment,
  ManagerBoardOrder,
  SaveDiagnosticInput,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderStatus,
  ServiceVisit,
  TechnicalRecommendation,
  Vehicle,
} from "@/lib/attendance/types";
import { normalizePhone, normalizePlate } from "@/lib/crm/normalize";

function toCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    cpf: row.cpf,
    email: row.email,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toVehicle(row: typeof vehicles.$inferSelect): Vehicle {
  return {
    id: row.id,
    customerId: row.customerId,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    year: row.year,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toServiceVisit(row: typeof serviceVisits.$inferSelect): ServiceVisit {
  return { id: row.id, customerId: row.customerId, vehicleId: row.vehicleId, mileageAtVisit: row.mileageAtVisit, createdAt: row.createdAt.toISOString() };
}

function toDiagnostic(row: typeof diagnostics.$inferSelect): Diagnostic {
  return {
    id: row.id,
    serviceVisitId: row.serviceVisitId,
    exterior: row.exteriorAssessment as unknown as ExteriorAssessment,
    interior: row.interiorAssessment as unknown as InteriorAssessment,
    observations: row.observations,
    // Sem escritor nesta sprint (upload real fica para depois) — sempre [] vindo do banco real.
    photos: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecommendation(row: typeof technicalRecommendations.$inferSelect): TechnicalRecommendation {
  return { id: row.id, serviceVisitId: row.serviceVisitId, category: row.category, observations: row.observations, createdAt: row.createdAt.toISOString() };
}

/**
 * Implementação real, ativada automaticamente quando DATABASE_URL está configurada (ver
 * repository-factory.ts). Mesmo padrão de `PostgresInventoryRepository`/`PostgresFinanceRepository`.
 */
export class PostgresAttendanceRepository implements AttendanceRepository {
  private db() {
    const db = getDb();
    if (!db) {
      throw new Error("PostgresAttendanceRepository foi instanciado sem DATABASE_URL configurada — bug em repository-factory.ts.");
    }
    return db;
  }

  async findCustomerByPhone(phone: string): Promise<Customer | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const rows = await this.db().select().from(customers).where(eq(customers.phone, phone)).limit(5);
    const match = rows.find((r) => normalizePhone(r.phone) === normalized);
    return match ? toCustomer(match) : null;
  }

  async findCustomerByCpf(cpf: string): Promise<Customer | null> {
    const digits = cpf.replace(/\D/g, "");
    if (!digits) return null;
    const rows = await this.db().select().from(customers).where(eq(customers.cpf, cpf)).limit(5);
    const match = rows.find((r) => r.cpf?.replace(/\D/g, "") === digits);
    return match ? toCustomer(match) : null;
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const [row] = await this.db().select().from(customers).where(eq(customers.id, id)).limit(1);
    return row ? toCustomer(row) : null;
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const [row] = await this.db()
      .insert(customers)
      .values({ name: input.name, phone: input.phone, cpf: input.cpf ?? null, source: "manual" })
      .returning();
    return toCustomer(row);
  }

  async findVehicleByPlate(plate: string): Promise<Vehicle | null> {
    const normalized = normalizePlate(plate);
    if (!normalized) return null;
    const rows = await this.db().select().from(vehicles).where(eq(vehicles.plate, plate)).limit(5);
    const match = rows.find((r) => normalizePlate(r.plate) === normalized);
    return match ? toVehicle(match) : null;
  }

  async getVehicle(id: string): Promise<Vehicle | null> {
    const [row] = await this.db().select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
    return row ? toVehicle(row) : null;
  }

  async listVehiclesByCustomer(customerId: string): Promise<Vehicle[]> {
    const rows = await this.db().select().from(vehicles).where(eq(vehicles.customerId, customerId));
    return rows.map(toVehicle);
  }

  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    const [row] = await this.db()
      .insert(vehicles)
      .values({
        customerId: input.customerId,
        plate: input.plate,
        brand: input.brand ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        color: input.color ?? null,
        source: "manual",
      })
      .returning();
    return toVehicle(row);
  }

  async createServiceVisit(input: { customerId: string; vehicleId: string; mileageAtVisit: number | null }): Promise<ServiceVisit> {
    const [row] = await this.db()
      .insert(serviceVisits)
      .values({ customerId: input.customerId, vehicleId: input.vehicleId, mileageAtVisit: input.mileageAtVisit, source: "manual" })
      .returning();
    return toServiceVisit(row);
  }

  async getServiceVisit(id: string): Promise<ServiceVisit | null> {
    const [row] = await this.db().select().from(serviceVisits).where(eq(serviceVisits.id, id)).limit(1);
    return row ? toServiceVisit(row) : null;
  }

  async listVisitsByCustomer(customerId: string): Promise<ServiceVisit[]> {
    const rows = await this.db().select().from(serviceVisits).where(eq(serviceVisits.customerId, customerId)).orderBy(desc(serviceVisits.createdAt));
    return rows.map(toServiceVisit);
  }

  async saveDiagnostic(input: SaveDiagnosticInput): Promise<Diagnostic> {
    const [row] = await this.db()
      .insert(diagnostics)
      .values({
        serviceVisitId: input.serviceVisitId,
        exteriorAssessment: input.exterior,
        interiorAssessment: input.interior,
        observations: input.observations ?? null,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: diagnostics.serviceVisitId,
        set: { exteriorAssessment: input.exterior, interiorAssessment: input.interior, observations: input.observations ?? null, updatedAt: new Date() },
      })
      .returning();
    return toDiagnostic(row);
  }

  async getDiagnosticByVisit(serviceVisitId: string): Promise<Diagnostic | null> {
    const [row] = await this.db().select().from(diagnostics).where(eq(diagnostics.serviceVisitId, serviceVisitId)).limit(1);
    return row ? toDiagnostic(row) : null;
  }

  async listDiagnosticsByCustomer(customerId: string): Promise<Diagnostic[]> {
    const visitIds = (await this.listVisitsByCustomer(customerId)).map((v) => v.id);
    if (visitIds.length === 0) return [];
    const rows = await this.db().select().from(diagnostics).where(inArray(diagnostics.serviceVisitId, visitIds));
    return rows.map(toDiagnostic);
  }

  async addRecommendation(input: AddRecommendationInput): Promise<TechnicalRecommendation> {
    const [row] = await this.db()
      .insert(technicalRecommendations)
      .values({ serviceVisitId: input.serviceVisitId, category: input.category, observations: input.observations ?? null, source: "manual" })
      .returning();
    return toRecommendation(row);
  }

  async listRecommendationsByVisit(serviceVisitId: string): Promise<TechnicalRecommendation[]> {
    const rows = await this.db().select().from(technicalRecommendations).where(eq(technicalRecommendations.serviceVisitId, serviceVisitId));
    return rows.map(toRecommendation);
  }

  async listRecommendationsByCustomer(customerId: string): Promise<TechnicalRecommendation[]> {
    const visitIds = (await this.listVisitsByCustomer(customerId)).map((v) => v.id);
    if (visitIds.length === 0) return [];
    const rows = await this.db().select().from(technicalRecommendations).where(inArray(technicalRecommendations.serviceVisitId, visitIds));
    return rows.map(toRecommendation);
  }

  private async loadOrderItems(serviceOrderId: string): Promise<ServiceOrderItem[]> {
    const rows = await this.db()
      .select({ id: serviceOrderItems.id, serviceOrderId: serviceOrderItems.serviceOrderId, serviceId: serviceOrderItems.serviceId, notes: serviceOrderItems.notes, serviceName: services.name })
      .from(serviceOrderItems)
      .innerJoin(services, eq(serviceOrderItems.serviceId, services.id))
      .where(eq(serviceOrderItems.serviceOrderId, serviceOrderId));
    return rows;
  }

  private async toServiceOrderWithItems(row: typeof serviceOrders.$inferSelect): Promise<ServiceOrder> {
    const items = await this.loadOrderItems(row.id);
    return { id: row.id, serviceVisitId: row.serviceVisitId, status: row.status, items, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async createServiceOrder(input: CreateServiceOrderInput): Promise<ServiceOrder> {
    const [orderRow] = await this.db().insert(serviceOrders).values({ serviceVisitId: input.serviceVisitId, status: "aguardando_execucao", source: "manual" }).returning();
    if (input.serviceIds.length > 0) {
      await this.db()
        .insert(serviceOrderItems)
        .values(input.serviceIds.map((serviceId) => ({ serviceOrderId: orderRow.id, serviceId, source: "manual" })));
    }
    return this.toServiceOrderWithItems(orderRow);
  }

  async getServiceOrder(id: string): Promise<ServiceOrder | null> {
    const [row] = await this.db().select().from(serviceOrders).where(eq(serviceOrders.id, id)).limit(1);
    return row ? this.toServiceOrderWithItems(row) : null;
  }

  async getServiceOrderByVisit(serviceVisitId: string): Promise<ServiceOrder | null> {
    const [row] = await this.db().select().from(serviceOrders).where(eq(serviceOrders.serviceVisitId, serviceVisitId)).limit(1);
    return row ? this.toServiceOrderWithItems(row) : null;
  }

  async listServiceOrdersByCustomer(customerId: string): Promise<ServiceOrder[]> {
    const visitIds = (await this.listVisitsByCustomer(customerId)).map((v) => v.id);
    if (visitIds.length === 0) return [];
    const rows = await this.db().select().from(serviceOrders).where(inArray(serviceOrders.serviceVisitId, visitIds));
    return Promise.all(rows.map((r) => this.toServiceOrderWithItems(r)));
  }

  async updateServiceOrderStatus(id: string, status: ServiceOrderStatus): Promise<ServiceOrder> {
    const [row] = await this.db().update(serviceOrders).set({ status, updatedAt: new Date() }).where(eq(serviceOrders.id, id)).returning();
    if (!row) throw new Error(`Ordem de serviço ${id} não encontrada.`);
    return this.toServiceOrderWithItems(row);
  }

  private boardSelect() {
    return this.db()
      .select({
        serviceOrderId: serviceOrders.id,
        status: serviceOrders.status,
        customerName: customers.name,
        vehicleModel: vehicles.model,
        vehiclePlate: vehicles.plate,
        updatedAt: serviceOrders.updatedAt,
      })
      .from(serviceOrders)
      .innerJoin(serviceVisits, eq(serviceOrders.serviceVisitId, serviceVisits.id))
      .innerJoin(customers, eq(serviceVisits.customerId, customers.id))
      .innerJoin(vehicles, eq(serviceVisits.vehicleId, vehicles.id));
  }

  async listBoardOrders(): Promise<ManagerBoardOrder[]> {
    const rows = await this.boardSelect().where(ne(serviceOrders.status, "entregue"));
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }

  async listDeliveredOnDate(dateIso: string): Promise<ManagerBoardOrder[]> {
    const rows = await this.boardSelect().where(eq(serviceOrders.status, "entregue"));
    return rows.filter((r) => r.updatedAt.toISOString().slice(0, 10) === dateIso).map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }

  async listServiceCatalog(): Promise<ServiceCatalogEntry[]> {
    const rows = await this.db().select().from(services).where(and(eq(services.active, true)));
    return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, defaultPrice: r.defaultPrice !== null ? Number(r.defaultPrice) : null }));
  }
}
