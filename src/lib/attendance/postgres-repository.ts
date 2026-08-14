import "server-only";
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, diagnosticPhotos, diagnostics, serviceOrderItems, serviceOrders, serviceVisits, services, technicalRecommendations, vehicles } from "@/db/schema";
import type { AttendanceRepository, ServiceCatalogEntry } from "@/lib/attendance/repository";
import type {
  AddPhotoInput,
  AddRecommendationInput,
  CreateCustomerInput,
  CreateVehicleInput,
  Customer,
  Diagnostic,
  DiagnosticPhoto,
  EngineAssessment,
  GlassAssessment,
  InteriorChecklist,
  ManagerBoardOrder,
  PaintAssessment,
  SaveDiagnosticInput,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderStatus,
  ServiceVisit,
  TechnicalRecommendation,
  TiresAssessment,
  Vehicle,
  WheelsAssessment,
} from "@/lib/attendance/types";
import { normalizeName, normalizePhone, normalizePlate } from "@/lib/crm/normalize";
import { SEARCH_RESULT_LIMIT } from "@/lib/attendance/search";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { RecentVehicleEntry } from "@/lib/attendance/repository";

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

interface StoredExteriorAssessment {
  pintura: PaintAssessment;
  rodas: WheelsAssessment;
  pneus: TiresAssessment;
  vidros: GlassAssessment;
  motor: EngineAssessment;
}

function toDiagnostic(row: typeof diagnostics.$inferSelect): Diagnostic {
  const exterior = row.exteriorAssessment as unknown as StoredExteriorAssessment;
  const interior = row.interiorAssessment as unknown as InteriorChecklist;
  return {
    id: row.id,
    serviceVisitId: row.serviceVisitId,
    pintura: exterior.pintura,
    rodas: exterior.rodas,
    pneus: exterior.pneus,
    vidros: exterior.vidros,
    motor: exterior.motor,
    interior,
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

function toPhoto(row: typeof diagnosticPhotos.$inferSelect): DiagnosticPhoto {
  return { id: row.id, area: row.area, url: row.url, caption: row.caption };
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

  /** Busca livre por nome do cliente OU marca/modelo de veículo — clientes com veículo batendo entram mesmo sem nome batendo. */
  async searchCustomersByText(query: string): Promise<Customer[]> {
    const needle = query.trim();
    if (needle.length < 2) return [];
    const pattern = `%${needle}%`;

    const byName = await this.db().select().from(customers).where(ilike(customers.name, pattern)).limit(SEARCH_RESULT_LIMIT);

    const byVehicle = await this.db()
      .select({ customer: customers })
      .from(vehicles)
      .innerJoin(customers, eq(vehicles.customerId, customers.id))
      .where(or(ilike(vehicles.brand, pattern), ilike(vehicles.model, pattern)))
      .limit(SEARCH_RESULT_LIMIT);

    const merged = new Map<string, typeof customers.$inferSelect>();
    for (const row of byName) merged.set(row.id, row);
    for (const row of byVehicle) merged.set(row.customer.id, row.customer);

    return Array.from(merged.values())
      .slice(0, SEARCH_RESULT_LIMIT)
      .map(toCustomer);
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await this.db().select().from(customers).orderBy(customers.name);
    return rows.map(toCustomer);
  }

  /**
   * Compara telefone por dígitos direto no SQL — pega o caso em que a formatação salva difere da
   * digitada agora (`eq()` de `findCustomerByPhone` não pega). Só aviso, nunca funde.
   * `'\\D'` (barra dupla): dentro de um template literal JS, `'\D'` cru vira `'D'` — a barra é
   * descartada por ser um escape não reconhecido (bug real, comprovado empiricamente na Missão
   * CRM V2 Fase 2 ao rodar esta classe de query contra o Postgres real). Barra dupla garante que
   * o Postgres receba o regex `\D` de verdade.
   */
  async findCustomersByNormalizedPhone(phone: string): Promise<Customer[]> {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];
    const rows = await this.db()
      .select()
      .from(customers)
      .where(sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') = ${normalized}`)
      .limit(5);
    return rows.map(toCustomer);
  }

  /** Nome normalizado (trim + espaços colapsados + minúsculo) — sinal fraco, só aviso; nome nunca funde cliente sozinho. Mesma barra dupla do método acima, mesmo motivo (`\\s`). */
  async findCustomersByNormalizedName(name: string): Promise<Customer[]> {
    const normalized = normalizeName(name);
    if (!normalized) return [];
    const rows = await this.db()
      .select()
      .from(customers)
      .where(sql`lower(regexp_replace(trim(${customers.name}), '\\s+', ' ', 'g')) = ${normalized.toLowerCase()}`)
      .limit(5);
    return rows.map(toCustomer);
  }

  async findVehicleByPlate(plate: string): Promise<Vehicle | null> {
    const normalized = normalizePlate(plate);
    if (!normalized) return null;
    const rows = await this.db().select().from(vehicles).where(eq(vehicles.plate, plate)).limit(5);
    const match = rows.find((r) => normalizePlate(r.plate) === normalized);
    return match ? toVehicle(match) : null;
  }

  /** Placa normalizada direto no SQL — mesmo espírito de `findCustomersByNormalizedPhone`, só aviso. */
  async findVehiclesByNormalizedPlate(plate: string): Promise<Vehicle[]> {
    const normalized = normalizePlate(plate);
    if (!normalized) return [];
    const rows = await this.db()
      .select()
      .from(vehicles)
      .where(sql`upper(replace(coalesce(${vehicles.plate}, ''), ' ', '')) = ${normalized}`)
      .limit(5);
    return rows.map(toVehicle);
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

  async listVisitsByVehicle(vehicleId: string): Promise<ServiceVisit[]> {
    const rows = await this.db().select().from(serviceVisits).where(eq(serviceVisits.vehicleId, vehicleId)).orderBy(desc(serviceVisits.createdAt));
    return rows.map(toServiceVisit);
  }

  async saveDiagnostic(input: SaveDiagnosticInput): Promise<Diagnostic> {
    const exteriorAssessment = { pintura: input.pintura, rodas: input.rodas, pneus: input.pneus, vidros: input.vidros, motor: input.motor } as unknown as Record<string, unknown>;
    const interiorAssessment = input.interior as unknown as Record<string, unknown>;
    const [row] = await this.db()
      .insert(diagnostics)
      .values({
        serviceVisitId: input.serviceVisitId,
        exteriorAssessment,
        interiorAssessment,
        observations: input.observations ?? null,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: diagnostics.serviceVisitId,
        set: { exteriorAssessment, interiorAssessment, observations: input.observations ?? null, updatedAt: new Date() },
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

  async countRecommendationsCreatedOnDate(dateIso: string): Promise<number> {
    const rows = await this.db().select({ createdAt: technicalRecommendations.createdAt }).from(technicalRecommendations);
    return rows.filter((r) => saoPauloDateISO(r.createdAt) === dateIso).length;
  }

  async addPhoto(input: AddPhotoInput): Promise<DiagnosticPhoto> {
    const [row] = await this.db()
      .insert(diagnosticPhotos)
      .values({ diagnosticId: input.diagnosticId, area: input.area, url: null, caption: input.caption ?? null, source: "manual" })
      .returning();
    return toPhoto(row);
  }

  async listPhotosByDiagnostic(diagnosticId: string): Promise<DiagnosticPhoto[]> {
    const rows = await this.db().select().from(diagnosticPhotos).where(eq(diagnosticPhotos.diagnosticId, diagnosticId));
    return rows.map(toPhoto);
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

  async startServiceOrder(serviceVisitId: string): Promise<ServiceOrder> {
    const [orderRow] = await this.db().insert(serviceOrders).values({ serviceVisitId, status: "recebido", source: "manual" }).returning();
    return this.toServiceOrderWithItems(orderRow);
  }

  async addServiceOrderItems(serviceOrderId: string, serviceIds: string[]): Promise<ServiceOrder> {
    if (serviceIds.length > 0) {
      await this.db()
        .insert(serviceOrderItems)
        .values(serviceIds.map((serviceId) => ({ serviceOrderId, serviceId, source: "manual" })));
    }
    const [row] = await this.db().select().from(serviceOrders).where(eq(serviceOrders.id, serviceOrderId)).limit(1);
    if (!row) throw new Error(`Ordem de serviço ${serviceOrderId} não encontrada.`);
    return this.toServiceOrderWithItems(row);
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
        customerId: customers.id,
        vehicleId: vehicles.id,
        visitId: serviceVisits.id,
        customerName: customers.name,
        vehicleModel: vehicles.model,
        vehiclePlate: vehicles.plate,
        updatedAt: serviceOrders.updatedAt,
        visitCreatedAt: serviceVisits.createdAt,
      })
      .from(serviceOrders)
      .innerJoin(serviceVisits, eq(serviceOrders.serviceVisitId, serviceVisits.id))
      .innerJoin(customers, eq(serviceVisits.customerId, customers.id))
      .innerJoin(vehicles, eq(serviceVisits.vehicleId, vehicles.id));
  }

  /** Busca nomes e valor total dos serviços aprovados de várias ordens numa única query — evita N+1 no Painel/Execução/Gestão do Dia. `defaultPrice` nulo conta como 0 — mesma regra usada em `dailyRevenue`. */
  private async loadServiceSummaryByOrder(serviceOrderIds: string[]): Promise<Map<string, { names: string[]; totalValue: number }>> {
    const summaryByOrder = new Map<string, { names: string[]; totalValue: number }>();
    if (serviceOrderIds.length === 0) return summaryByOrder;
    const rows = await this.db()
      .select({ serviceOrderId: serviceOrderItems.serviceOrderId, serviceName: services.name, defaultPrice: services.defaultPrice })
      .from(serviceOrderItems)
      .innerJoin(services, eq(serviceOrderItems.serviceId, services.id))
      .where(inArray(serviceOrderItems.serviceOrderId, serviceOrderIds));
    for (const row of rows) {
      const existing = summaryByOrder.get(row.serviceOrderId) ?? { names: [], totalValue: 0 };
      existing.names.push(row.serviceName);
      existing.totalValue += row.defaultPrice !== null ? Number(row.defaultPrice) : 0;
      summaryByOrder.set(row.serviceOrderId, existing);
    }
    return summaryByOrder;
  }

  private async toManagerBoardOrders(
    rows: Array<{
      serviceOrderId: string;
      status: ServiceOrderStatus;
      customerId: string;
      vehicleId: string;
      visitId: string;
      customerName: string | null;
      vehicleModel: string | null;
      vehiclePlate: string | null;
      updatedAt: Date;
      visitCreatedAt: Date;
    }>,
  ): Promise<ManagerBoardOrder[]> {
    const summaryByOrder = await this.loadServiceSummaryByOrder(rows.map((r) => r.serviceOrderId));
    return rows.map((r) => {
      const summary = summaryByOrder.get(r.serviceOrderId) ?? { names: [], totalValue: 0 };
      return { ...r, updatedAt: r.updatedAt.toISOString(), visitCreatedAt: r.visitCreatedAt.toISOString(), serviceNames: summary.names, totalValue: summary.totalValue };
    });
  }

  async listBoardOrders(): Promise<ManagerBoardOrder[]> {
    const rows = await this.boardSelect().where(ne(serviceOrders.status, "entregue"));
    return this.toManagerBoardOrders(rows);
  }

  async listDeliveredOnDate(dateIso: string): Promise<ManagerBoardOrder[]> {
    const rows = await this.boardSelect().where(eq(serviceOrders.status, "entregue"));
    const todaysRows = rows.filter((r) => saoPauloDateISO(r.updatedAt) === dateIso);
    return this.toManagerBoardOrders(todaysRows);
  }

  /** Mesma estratégia de `listDeliveredOnDate`: filtra em JS pela data de `service_visits.created_at`, sem depender de fuso do banco. */
  async listServiceOrdersVisitedOnDate(dateIso: string): Promise<ServiceOrder[]> {
    const rows = await this.db()
      .select({ order: serviceOrders, visitCreatedAt: serviceVisits.createdAt })
      .from(serviceOrders)
      .innerJoin(serviceVisits, eq(serviceOrders.serviceVisitId, serviceVisits.id));
    const todaysRows = rows.filter((r) => saoPauloDateISO(r.visitCreatedAt) === dateIso);
    return Promise.all(todaysRows.map((r) => this.toServiceOrderWithItems(r.order)));
  }

  /** Qualquer status (inclusive `entregue`) cuja visita caiu no intervalo `[fromIso, toIso]` — base da seção "Entradas"/tela "Timeline" da Gestão do Dia. */
  async listOrdersInRange(fromIso: string, toIso: string): Promise<ManagerBoardOrder[]> {
    const rows = await this.boardSelect();
    const inRange = rows.filter((r) => {
      const day = saoPauloDateISO(r.visitCreatedAt);
      return day >= fromIso && day <= toIso;
    });
    return this.toManagerBoardOrders(inRange);
  }

  async listRecentVehiclesWithCustomer(limit: number): Promise<RecentVehicleEntry[]> {
    const rows = await this.db()
      .select({ vehicle: vehicles, customer: customers })
      .from(vehicles)
      .innerJoin(customers, eq(vehicles.customerId, customers.id))
      .orderBy(desc(vehicles.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ vehicle: toVehicle(r.vehicle), customer: toCustomer(r.customer) }));
  }

  async listServiceCatalog(): Promise<ServiceCatalogEntry[]> {
    const rows = await this.db().select().from(services).where(and(eq(services.active, true)));
    return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, defaultPrice: r.defaultPrice !== null ? Number(r.defaultPrice) : null }));
  }
}
