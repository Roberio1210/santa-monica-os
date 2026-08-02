import type {
  AddRecommendationInput,
  CreateCustomerInput,
  CreateServiceOrderInput,
  CreateVehicleInput,
  Customer,
  Diagnostic,
  ManagerBoardOrder,
  SaveDiagnosticInput,
  ServiceOrder,
  ServiceOrderStatus,
  ServiceVisit,
  TechnicalRecommendation,
  Vehicle,
} from "@/lib/attendance/types";

export interface ServiceCatalogEntry {
  id: string;
  name: string;
  category: string | null;
  defaultPrice: number | null;
}

/**
 * Interface única do Atendimento Inteligente — mesmo padrão de `FinanceRepository`/
 * `StonePersistenceRepository`: uma interface, duas implementações (`memory` para
 * desenvolvimento sem banco, `postgres` para produção), escolhidas por `repository-factory.ts`
 * via `getStorageMode()`. Não cria nenhum método especulativo além do necessário para o fluxo
 * desta sprint.
 */
export interface AttendanceRepository {
  findCustomerByPhone(phone: string): Promise<Customer | null>;
  findCustomerByCpf(cpf: string): Promise<Customer | null>;
  getCustomer(id: string): Promise<Customer | null>;
  createCustomer(input: CreateCustomerInput): Promise<Customer>;

  findVehicleByPlate(plate: string): Promise<Vehicle | null>;
  getVehicle(id: string): Promise<Vehicle | null>;
  listVehiclesByCustomer(customerId: string): Promise<Vehicle[]>;
  createVehicle(input: CreateVehicleInput): Promise<Vehicle>;

  createServiceVisit(input: { customerId: string; vehicleId: string; mileageAtVisit: number | null }): Promise<ServiceVisit>;
  getServiceVisit(id: string): Promise<ServiceVisit | null>;
  listVisitsByCustomer(customerId: string): Promise<ServiceVisit[]>;

  /** Upsert por `serviceVisitId` (constraint única) — nunca duplica diagnóstico da mesma visita. */
  saveDiagnostic(input: SaveDiagnosticInput): Promise<Diagnostic>;
  getDiagnosticByVisit(serviceVisitId: string): Promise<Diagnostic | null>;
  listDiagnosticsByCustomer(customerId: string): Promise<Diagnostic[]>;

  addRecommendation(input: AddRecommendationInput): Promise<TechnicalRecommendation>;
  listRecommendationsByVisit(serviceVisitId: string): Promise<TechnicalRecommendation[]>;
  listRecommendationsByCustomer(customerId: string): Promise<TechnicalRecommendation[]>;

  createServiceOrder(input: CreateServiceOrderInput): Promise<ServiceOrder>;
  getServiceOrder(id: string): Promise<ServiceOrder | null>;
  getServiceOrderByVisit(serviceVisitId: string): Promise<ServiceOrder | null>;
  listServiceOrdersByCustomer(customerId: string): Promise<ServiceOrder[]>;
  updateServiceOrderStatus(id: string, status: ServiceOrderStatus): Promise<ServiceOrder>;

  /** Todas as ordens ativas (não entregues), já com dado de cliente/veículo para o Painel do Gerente. */
  listBoardOrders(): Promise<ManagerBoardOrder[]>;
  /** Ordens com status `entregue` cujo `updatedAt` cai no dia informado (YYYY-MM-DD, America/Sao_Paulo). */
  listDeliveredOnDate(dateIso: string): Promise<ManagerBoardOrder[]>;

  listServiceCatalog(): Promise<ServiceCatalogEntry[]>;
}
