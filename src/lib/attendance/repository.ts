import type {
  AddPhotoInput,
  AddRecommendationInput,
  CreateCustomerInput,
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

export interface RecentVehicleEntry {
  vehicle: Vehicle;
  customer: Customer;
}

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
  /** Busca livre por nome do cliente OU marca/modelo de veículo — usada quando a query não é telefone nem placa. Limitada a poucos resultados. */
  searchCustomersByText(query: string): Promise<Customer[]>;

  findVehicleByPlate(plate: string): Promise<Vehicle | null>;
  getVehicle(id: string): Promise<Vehicle | null>;
  listVehiclesByCustomer(customerId: string): Promise<Vehicle[]>;
  createVehicle(input: CreateVehicleInput): Promise<Vehicle>;

  createServiceVisit(input: { customerId: string; vehicleId: string; mileageAtVisit: number | null }): Promise<ServiceVisit>;
  getServiceVisit(id: string): Promise<ServiceVisit | null>;
  listVisitsByCustomer(customerId: string): Promise<ServiceVisit[]>;
  listVisitsByVehicle(vehicleId: string): Promise<ServiceVisit[]>;

  /** Upsert por `serviceVisitId` (constraint única) — nunca duplica diagnóstico da mesma visita. */
  saveDiagnostic(input: SaveDiagnosticInput): Promise<Diagnostic>;
  getDiagnosticByVisit(serviceVisitId: string): Promise<Diagnostic | null>;
  listDiagnosticsByCustomer(customerId: string): Promise<Diagnostic[]>;

  addRecommendation(input: AddRecommendationInput): Promise<TechnicalRecommendation>;
  listRecommendationsByVisit(serviceVisitId: string): Promise<TechnicalRecommendation[]>;
  listRecommendationsByCustomer(customerId: string): Promise<TechnicalRecommendation[]>;

  /** `url` sempre `null` — só registra que a foto foi capturada e em qual etapa (estrutura preparada, sem upload real). */
  addPhoto(input: AddPhotoInput): Promise<DiagnosticPhoto>;
  listPhotosByDiagnostic(diagnosticId: string): Promise<DiagnosticPhoto[]>;

  /** Cria a ordem assim que a visita começa — sempre `recebido`, sem itens ainda. */
  startServiceOrder(serviceVisitId: string): Promise<ServiceOrder>;
  /** Anexa os serviços aprovados a uma ordem já existente — nunca cria uma ordem nova. */
  addServiceOrderItems(serviceOrderId: string, serviceIds: string[]): Promise<ServiceOrder>;
  getServiceOrder(id: string): Promise<ServiceOrder | null>;
  getServiceOrderByVisit(serviceVisitId: string): Promise<ServiceOrder | null>;
  listServiceOrdersByCustomer(customerId: string): Promise<ServiceOrder[]>;
  updateServiceOrderStatus(id: string, status: ServiceOrderStatus): Promise<ServiceOrder>;

  /** Todas as ordens ativas (não entregues), já com dado de cliente/veículo para o Painel do Gerente. */
  listBoardOrders(): Promise<ManagerBoardOrder[]>;
  /** Ordens com status `entregue` cujo `updatedAt` cai no dia informado (YYYY-MM-DD, America/Sao_Paulo). */
  listDeliveredOnDate(dateIso: string): Promise<ManagerBoardOrder[]>;
  /** Ordens cuja visita (`service_visits.created_at`) cai no dia informado — usado no faturamento do dia da Home. */
  listServiceOrdersVisitedOnDate(dateIso: string): Promise<ServiceOrder[]>;
  /** Todas as ordens (qualquer status, incluindo `entregue`) cuja visita caiu no intervalo — base da seção "Entradas" da Gestão do Dia, mostra o status ATUAL de cada uma (não há histórico de status por dia). */
  listOrdersInRange(fromIso: string, toIso: string): Promise<ManagerBoardOrder[]>;

  /** Veículos mais recentemente atualizados, com o cliente dono — base da tela "Veículos". */
  listRecentVehiclesWithCustomer(limit: number): Promise<RecentVehicleEntry[]>;

  listServiceCatalog(): Promise<ServiceCatalogEntry[]>;
}
