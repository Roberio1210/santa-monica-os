import { randomUUID } from "node:crypto";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { AttendanceRepository } from "@/lib/attendance/repository";
import type {
  AddPhotoInput,
  AddRecommendationInput,
  CreateCustomerInput,
  CreateServiceOrderInput,
  CreateVehicleInput,
  Customer,
  Diagnostic,
  DiagnosticPhoto,
  ManagerBoardOrder,
  SaveDiagnosticInput,
  ServiceOrder,
  ServiceOrderStatus,
  ServiceVisit,
  TechnicalRecommendation,
  Vehicle,
} from "@/lib/attendance/types";
import { normalizePhone, normalizePlate } from "@/lib/crm/normalize";
import { SEARCH_RESULT_LIMIT } from "@/lib/attendance/search";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/** Catálogo mínimo para desenvolvimento sem banco (`DATABASE_URL` ausente) — nunca usado em produção. */
const DEV_SERVICE_CATALOG: ServiceCatalogEntry[] = [
  { id: "dev-lavacao", name: "Lavação Completa", category: "Lavação", defaultPrice: 80 },
  { id: "dev-polimento", name: "Polimento Técnico", category: "Polimento", defaultPrice: 350 },
  { id: "dev-higienizacao", name: "Higienização Interna", category: "Higienização", defaultPrice: 250 },
  { id: "dev-vitrificacao", name: "Vitrificação de Pintura", category: "Vitrificação", defaultPrice: 900 },
];

function nowIso(): string {
  return new Date().toISOString();
}

/** Implementação em memória — mesmo papel de `StaticFinanceRepository`, só para desenvolvimento sem Postgres. */
export class MemoryAttendanceRepository implements AttendanceRepository {
  private customers = new Map<string, Customer>();
  private vehicles = new Map<string, Vehicle>();
  private visits = new Map<string, ServiceVisit>();
  private diagnostics = new Map<string, Diagnostic>(); // key: serviceVisitId
  private recommendations = new Map<string, TechnicalRecommendation>();
  private orders = new Map<string, ServiceOrder>();
  private photos = new Map<string, DiagnosticPhoto & { diagnosticId: string }>();

  async findCustomerByPhone(phone: string): Promise<Customer | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    for (const c of this.customers.values()) {
      if (normalizePhone(c.phone) === normalized) return c;
    }
    return null;
  }

  async findCustomerByCpf(cpf: string): Promise<Customer | null> {
    const digits = cpf.replace(/\D/g, "");
    for (const c of this.customers.values()) {
      if (c.cpf?.replace(/\D/g, "") === digits) return c;
    }
    return null;
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.customers.get(id) ?? null;
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const customer: Customer = {
      id: randomUUID(),
      name: input.name,
      phone: input.phone,
      cpf: input.cpf ?? null,
      email: null,
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.customers.set(customer.id, customer);
    return customer;
  }

  async searchCustomersByText(query: string): Promise<Customer[]> {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const matchedByName = new Set<string>();
    for (const c of this.customers.values()) {
      if (c.name?.toLowerCase().includes(needle)) matchedByName.add(c.id);
    }
    for (const v of this.vehicles.values()) {
      const matches = v.brand?.toLowerCase().includes(needle) || v.model?.toLowerCase().includes(needle);
      if (matches) matchedByName.add(v.customerId);
    }
    return Array.from(matchedByName)
      .map((id) => this.customers.get(id))
      .filter((c): c is Customer => !!c)
      .slice(0, SEARCH_RESULT_LIMIT);
  }

  async findVehicleByPlate(plate: string): Promise<Vehicle | null> {
    const normalized = normalizePlate(plate);
    if (!normalized) return null;
    for (const v of this.vehicles.values()) {
      if (normalizePlate(v.plate) === normalized) return v;
    }
    return null;
  }

  async getVehicle(id: string): Promise<Vehicle | null> {
    return this.vehicles.get(id) ?? null;
  }

  async listVehiclesByCustomer(customerId: string): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values()).filter((v) => v.customerId === customerId);
  }

  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    const vehicle: Vehicle = {
      id: randomUUID(),
      customerId: input.customerId,
      plate: input.plate,
      brand: input.brand ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      color: input.color ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async createServiceVisit(input: { customerId: string; vehicleId: string; mileageAtVisit: number | null }): Promise<ServiceVisit> {
    const visit: ServiceVisit = { id: randomUUID(), customerId: input.customerId, vehicleId: input.vehicleId, mileageAtVisit: input.mileageAtVisit, createdAt: nowIso() };
    this.visits.set(visit.id, visit);
    return visit;
  }

  async getServiceVisit(id: string): Promise<ServiceVisit | null> {
    return this.visits.get(id) ?? null;
  }

  async listVisitsByCustomer(customerId: string): Promise<ServiceVisit[]> {
    return Array.from(this.visits.values()).filter((v) => v.customerId === customerId);
  }

  async saveDiagnostic(input: SaveDiagnosticInput): Promise<Diagnostic> {
    const existing = this.diagnostics.get(input.serviceVisitId);
    const diagnostic: Diagnostic = {
      id: existing?.id ?? randomUUID(),
      serviceVisitId: input.serviceVisitId,
      exterior: input.exterior,
      interior: input.interior,
      observations: input.observations ?? null,
      photos: existing?.photos ?? [],
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.diagnostics.set(input.serviceVisitId, diagnostic);
    return diagnostic;
  }

  async getDiagnosticByVisit(serviceVisitId: string): Promise<Diagnostic | null> {
    return this.diagnostics.get(serviceVisitId) ?? null;
  }

  async listDiagnosticsByCustomer(customerId: string): Promise<Diagnostic[]> {
    const visitIds = new Set((await this.listVisitsByCustomer(customerId)).map((v) => v.id));
    return Array.from(this.diagnostics.values()).filter((d) => visitIds.has(d.serviceVisitId));
  }

  async addRecommendation(input: AddRecommendationInput): Promise<TechnicalRecommendation> {
    const recommendation: TechnicalRecommendation = {
      id: randomUUID(),
      serviceVisitId: input.serviceVisitId,
      category: input.category,
      observations: input.observations ?? null,
      createdAt: nowIso(),
    };
    this.recommendations.set(recommendation.id, recommendation);
    return recommendation;
  }

  async listRecommendationsByVisit(serviceVisitId: string): Promise<TechnicalRecommendation[]> {
    return Array.from(this.recommendations.values()).filter((r) => r.serviceVisitId === serviceVisitId);
  }

  async listRecommendationsByCustomer(customerId: string): Promise<TechnicalRecommendation[]> {
    const visitIds = new Set((await this.listVisitsByCustomer(customerId)).map((v) => v.id));
    return Array.from(this.recommendations.values()).filter((r) => visitIds.has(r.serviceVisitId));
  }

  async addPhoto(input: AddPhotoInput): Promise<DiagnosticPhoto> {
    const photo: DiagnosticPhoto & { diagnosticId: string } = {
      id: randomUUID(),
      diagnosticId: input.diagnosticId,
      stage: input.stage,
      url: null,
      caption: input.caption ?? null,
    };
    this.photos.set(photo.id, photo);
    return photo;
  }

  async listPhotosByDiagnostic(diagnosticId: string): Promise<DiagnosticPhoto[]> {
    return Array.from(this.photos.values()).filter((p) => p.diagnosticId === diagnosticId);
  }

  async createServiceOrder(input: CreateServiceOrderInput): Promise<ServiceOrder> {
    const catalog = await this.listServiceCatalog();
    const catalogById = new Map(catalog.map((s) => [s.id, s]));
    const order: ServiceOrder = {
      id: randomUUID(),
      serviceVisitId: input.serviceVisitId,
      status: "aguardando_execucao",
      items: input.serviceIds.map((serviceId) => ({
        id: randomUUID(),
        serviceOrderId: "",
        serviceId,
        serviceName: catalogById.get(serviceId)?.name ?? "Serviço",
        notes: null,
      })),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    order.items = order.items.map((item) => ({ ...item, serviceOrderId: order.id }));
    this.orders.set(order.id, order);
    return order;
  }

  async getServiceOrder(id: string): Promise<ServiceOrder | null> {
    return this.orders.get(id) ?? null;
  }

  async getServiceOrderByVisit(serviceVisitId: string): Promise<ServiceOrder | null> {
    return Array.from(this.orders.values()).find((o) => o.serviceVisitId === serviceVisitId) ?? null;
  }

  async listServiceOrdersByCustomer(customerId: string): Promise<ServiceOrder[]> {
    const visitIds = new Set((await this.listVisitsByCustomer(customerId)).map((v) => v.id));
    return Array.from(this.orders.values()).filter((o) => visitIds.has(o.serviceVisitId));
  }

  async updateServiceOrderStatus(id: string, status: ServiceOrderStatus): Promise<ServiceOrder> {
    const order = this.orders.get(id);
    if (!order) throw new Error(`Ordem de serviço ${id} não encontrada.`);
    const updated: ServiceOrder = { ...order, status, updatedAt: nowIso() };
    this.orders.set(id, updated);
    return updated;
  }

  private async boardEntry(order: ServiceOrder): Promise<ManagerBoardOrder> {
    const visit = this.visits.get(order.serviceVisitId);
    const customer = visit ? this.customers.get(visit.customerId) : null;
    const vehicle = visit ? this.vehicles.get(visit.vehicleId) : null;
    return {
      serviceOrderId: order.id,
      status: order.status,
      customerName: customer?.name ?? null,
      vehicleModel: vehicle?.model ?? null,
      vehiclePlate: vehicle?.plate ?? null,
      updatedAt: order.updatedAt,
      visitCreatedAt: visit?.createdAt ?? order.createdAt,
    };
  }

  async listBoardOrders(): Promise<ManagerBoardOrder[]> {
    const active = Array.from(this.orders.values()).filter((o) => o.status !== "entregue");
    return Promise.all(active.map((o) => this.boardEntry(o)));
  }

  async listDeliveredOnDate(dateIso: string): Promise<ManagerBoardOrder[]> {
    const delivered = Array.from(this.orders.values()).filter((o) => o.status === "entregue" && saoPauloDateISO(new Date(o.updatedAt)) === dateIso);
    return Promise.all(delivered.map((o) => this.boardEntry(o)));
  }

  async listServiceOrdersVisitedOnDate(dateIso: string): Promise<ServiceOrder[]> {
    const visitIdsToday = new Set(Array.from(this.visits.values()).filter((v) => saoPauloDateISO(new Date(v.createdAt)) === dateIso).map((v) => v.id));
    return Array.from(this.orders.values()).filter((o) => visitIdsToday.has(o.serviceVisitId));
  }

  async listServiceCatalog(): Promise<ServiceCatalogEntry[]> {
    return DEV_SERVICE_CATALOG;
  }
}
