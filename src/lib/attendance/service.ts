import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import type { RecentVehicleEntry, ServiceCatalogEntry } from "@/lib/attendance/repository";
import { summarizeCustomerHistory } from "@/lib/attendance/history";
import { summarizeHome } from "@/lib/attendance/home";
import { looksLikePhone, looksLikePlate } from "@/lib/attendance/search";
import { summarizeTimeline, type TimelineEntry } from "@/lib/attendance/timeline";
import { resolveDayPeriod, type DayPeriodKey, type DayPeriodRange } from "@/lib/attendance/period";
import { buildDayTimeline, deriveOperationalAlerts, type OperationalAlert, type OperationsEvent } from "@/lib/attendance/operationsCenter";
import {
  SERVICE_ORDER_STATUSES,
  SERVICE_ORDER_STATUS_LABELS,
  type Customer,
  type CustomerHistorySummary,
  type Diagnostic,
  type DiagnosticArea,
  type DiagnosticPhoto,
  type EngineAssessment,
  type GlassAssessment,
  type HomeSummary,
  type InteriorChecklist,
  type ManagerBoardColumn,
  type ManagerBoardOrder,
  type OrderDetail,
  type PaintAssessment,
  type ServiceOrder,
  type ServiceOrderStatus,
  type ServiceVisit,
  type TechnicalRecommendation,
  type TiresAssessment,
  type Vehicle,
  type WheelsAssessment,
} from "@/lib/attendance/types";
import { nextStatus } from "@/lib/attendance/status";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import { fetchActiveGoal } from "@/lib/goals/service";
import { resolveCustomerIdentity, resolveVehicleIdentity } from "@/lib/crm/identityResolution";

/**
 * Orquestração do Atendimento Inteligente — único ponto de I/O do módulo. Toda lógica pura
 * (histórico, status, catálogos) vive em módulos sem I/O e é sempre reaproveitada daqui, nunca
 * duplicada.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

/** Carrega o contexto completo de um cliente já identificado (ex.: veio da tela Buscar) — mesmo formato de `searchByPhoneOrPlate`, sem precisar buscar de novo. */
export async function fetchCustomerSearchResult(customerId: string): Promise<SearchResult | null> {
  const repo = getAttendanceRepository();
  const customer = await repo.getCustomer(customerId);
  if (!customer) return null;
  const history = await buildHistory(customer);
  return { customer, vehicles: history.vehicles, matchedVehicleId: null, history };
}

/** Busca livre por nome/veículo — usada quando a query não é telefone nem placa. Retorna vários resultados, nunca um só "adivinhado". */
export async function searchCustomersByText(query: string): Promise<SearchResult[]> {
  const repo = getAttendanceRepository();
  const matches = await repo.searchCustomersByText(query);
  return Promise.all(
    matches.map(async (customer) => {
      const history = await buildHistory(customer);
      return { customer, vehicles: history.vehicles, matchedVehicleId: null, history };
    }),
  );
}

export interface QuickRegisterInput {
  customerName: string;
  customerPhone: string;
  customerCpf?: string | null;
  /**
   * Missão 3.2.3 — `null` só é aceito pelo fluxo de Planejamento (agendamento futuro, veículo
   * ainda não chegou). O Atendimento continua exigindo placa não vazia na validação do próprio
   * formulário antes de chamar esta função — este tipo ficou permissivo de propósito, mas isso
   * não afrouxa o Atendimento porque a exigência dele nunca dependeu deste tipo, só do seu form.
   */
  vehiclePlate: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  vehicleColor?: string | null;
}

export interface QuickRegisterResult {
  customer: Customer;
  vehicle: Vehicle;
  /**
   * Missão CRM V2 Final (Parte 6) — clientes já cadastrados que o motor de identidade da Fase 2
   * (`resolveCustomerIdentity`) classificou como HIGH_CONFIDENCE ou REVIEW contra o novo cadastro.
   * Só preenchido quando um cliente NOVO foi criado (telefone completo batendo continua
   * reaproveitando direto via EXACT, sem aviso — mesmo comportamento de antes). INSUFFICIENT e
   * CONFLICT nunca aparecem aqui: insuficiente não tem o que mostrar, e conflito nunca deve
   * sugerir fusão (regra explícita da missão). Puramente informativo: nunca bloqueia o cadastro,
   * nunca funde, não exige autorização do gestor.
   */
  possibleDuplicateCustomers: Customer[];
  /** Mesmo espírito, para veículo, via `resolveVehicleIdentity`. */
  possibleDuplicateVehicles: Vehicle[];
}

/**
 * Filtra candidatos de possível duplicidade de CLIENTE pela classificação do motor da Fase 2 —
 * só HIGH_CONFIDENCE/REVIEW viram aviso (nunca INSUFFICIENT, nunca CONFLICT). `linkedVehiclePlate`
 * fica de fora aqui deliberadamente: no momento do cadastro rápido o veículo do candidato ainda
 * não foi carregado (custaria uma consulta extra por candidato) e nome+telefone já bastam para as
 * classificações que importam para este aviso.
 */
function filterCustomerCandidatesByEngine(target: { name: string; phone: string }, candidates: Customer[]): Customer[] {
  if (candidates.length === 0) return [];
  const result = resolveCustomerIdentity(
    { id: "novo", name: target.name, phone: target.phone },
    candidates.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
  );
  if (result.classification !== "HIGH_CONFIDENCE" && result.classification !== "REVIEW") return [];
  const idsToShow = new Set(result.evidenceByCandidate.map((e) => e.candidateId));
  return candidates.filter((c) => idsToShow.has(c.id));
}

/** Mesmo espírito de `filterCustomerCandidatesByEngine`, para VEÍCULO via `resolveVehicleIdentity`. */
function filterVehicleCandidatesByEngine(target: { plate: string; model: string | null }, candidates: Vehicle[]): Vehicle[] {
  if (candidates.length === 0) return [];
  const result = resolveVehicleIdentity(
    { id: "novo", plate: target.plate, model: target.model },
    candidates.map((v) => ({ id: v.id, plate: v.plate, model: v.model })),
  );
  if (result.classification !== "HIGH_CONFIDENCE" && result.classification !== "REVIEW") return [];
  const idsToShow = new Set(result.evidenceByCandidate.map((e) => e.candidateId));
  return candidates.filter((v) => idsToShow.has(v.id));
}

/** Cadastro rápido — nunca duplica cliente/veículo já existente por telefone/placa; quando cria um registro novo, avisa (sem bloquear) se o motor de identidade classificar algum candidato como HIGH_CONFIDENCE/REVIEW. */
export async function registerQuickCustomerAndVehicle(input: QuickRegisterInput): Promise<QuickRegisterResult> {
  const repo = getAttendanceRepository();

  const existingCustomer = await repo.findCustomerByPhone(input.customerPhone);
  let possibleDuplicateCustomers: Customer[] = [];
  let customer: Customer;
  if (existingCustomer) {
    customer = existingCustomer;
  } else {
    const [byPhone, byName] = await Promise.all([
      repo.findCustomersByNormalizedPhone(input.customerPhone),
      repo.findCustomersByNormalizedName(input.customerName),
    ]);
    const seen = new Map<string, Customer>();
    for (const c of [...byPhone, ...byName]) seen.set(c.id, c);
    possibleDuplicateCustomers = filterCustomerCandidatesByEngine({ name: input.customerName, phone: input.customerPhone }, Array.from(seen.values()));
    customer = await repo.createCustomer({ name: input.customerName, phone: input.customerPhone, cpf: input.customerCpf ?? null });
  }

  // Missão 3.2.3 — sem placa (agendamento futuro do Planejamento), não há chave nenhuma para
  // buscar ou deduplicar: nunca tenta casar por modelo/nome, sempre cria veículo novo com
  // plate=null. `findVehicleByPlate`/`findVehiclesByNormalizedPlate` recebem `string`, não
  // `string | null` — por isso só são chamadas quando a placa existe.
  const existingVehicle = input.vehiclePlate ? await repo.findVehicleByPlate(input.vehiclePlate) : null;
  let possibleDuplicateVehicles: Vehicle[] = [];
  let vehicle: Vehicle;
  if (existingVehicle && existingVehicle.customerId === customer.id) {
    vehicle = existingVehicle;
  } else {
    // Placa já cadastrada em outro cliente é, ela própria, o sinal de aviso (o motor confirmaria
    // EXACT/HIGH_CONFIDENCE de qualquer forma — evita uma chamada redundante ao motor aqui).
    possibleDuplicateVehicles = existingVehicle
      ? [existingVehicle]
      : input.vehiclePlate
        ? filterVehicleCandidatesByEngine({ plate: input.vehiclePlate, model: input.vehicleModel ?? null }, await repo.findVehiclesByNormalizedPlate(input.vehiclePlate))
        : [];
    vehicle = await repo.createVehicle({
      customerId: customer.id,
      plate: input.vehiclePlate,
      brand: input.vehicleBrand ?? null,
      model: input.vehicleModel ?? null,
      year: input.vehicleYear ?? null,
      color: input.vehicleColor ?? null,
    });
  }

  return { customer, vehicle, possibleDuplicateCustomers, possibleDuplicateVehicles };
}

export async function startAttendance(customerId: string, vehicleId: string, mileageAtVisit: number | null): Promise<ServiceVisit> {
  return getAttendanceRepository().createServiceVisit({ customerId, vehicleId, mileageAtVisit });
}

/** A Ordem de Serviço nasce junto com a visita, status `recebido` — muito antes de ter serviços aprovados. */
export async function startServiceOrder(serviceVisitId: string): Promise<ServiceOrder> {
  return getAttendanceRepository().startServiceOrder(serviceVisitId);
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

export async function saveDiagnosticStep(
  serviceVisitId: string,
  pintura: PaintAssessment,
  rodas: WheelsAssessment,
  pneus: TiresAssessment,
  vidros: GlassAssessment,
  motor: EngineAssessment,
  interior: InteriorChecklist,
  observations: string | null,
): Promise<Diagnostic> {
  return getAttendanceRepository().saveDiagnostic({ serviceVisitId, pintura, rodas, pneus, vidros, motor, interior, observations });
}

/** `caption` é sempre `null`/livre — nunca inventa legenda. `url` sempre `null` (sem upload real nesta sprint). */
export async function addDiagnosticPhoto(diagnosticId: string, area: DiagnosticArea, caption: string | null = null): Promise<DiagnosticPhoto> {
  return getAttendanceRepository().addPhoto({ diagnosticId, area, caption });
}

export async function listDiagnosticPhotos(diagnosticId: string): Promise<DiagnosticPhoto[]> {
  return getAttendanceRepository().listPhotosByDiagnostic(diagnosticId);
}

export async function addTechnicalRecommendation(serviceVisitId: string, category: string, observations: string | null): Promise<TechnicalRecommendation> {
  return getAttendanceRepository().addRecommendation({ serviceVisitId, category, observations });
}

/**
 * Anexa os serviços aprovados à ordem que já existe desde o início da visita (nunca cria uma
 * ordem nova) e avança direto para `aguardando_execucao` — a etapa de diagnóstico já foi
 * percorrida antes deste ponto no fluxo.
 */
export async function createServiceOrderFromApprovedServices(serviceVisitId: string, serviceIds: string[]): Promise<ServiceOrder> {
  if (serviceIds.length === 0) {
    throw new Error("Selecione ao menos um serviço aprovado para criar a Ordem de Serviço.");
  }
  const repo = getAttendanceRepository();
  const order = await repo.getServiceOrderByVisit(serviceVisitId);
  if (!order) {
    throw new Error("Ordem de serviço não encontrada para esta visita — o atendimento não foi iniciado corretamente.");
  }
  await repo.addServiceOrderItems(order.id, serviceIds);
  return repo.updateServiceOrderStatus(order.id, "aguardando_execucao");
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

/** Tudo que a tela "Detalhe do Veículo" precisa, numa única chamada — fotos já anexadas ao diagnóstico. */
export async function fetchOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const repo = getAttendanceRepository();
  const order = await repo.getServiceOrder(orderId);
  if (!order) return null;

  const context = await fetchServiceVisitContext(order.serviceVisitId);
  if (!context) return null;

  const diagnostic = context.diagnostic ? { ...context.diagnostic, photos: await repo.listPhotosByDiagnostic(context.diagnostic.id) } : null;

  const catalog = await repo.listServiceCatalog();
  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));
  const totalValue = round2(order.items.reduce((sum, item) => sum + (servicePriceById[item.serviceId] ?? 0), 0));

  return { order, visit: context.visit, customer: context.customer, vehicle: context.vehicle, diagnostic, recommendations: context.recommendations, totalValue };
}

/** Home — só contagens e valores reais, nunca uma meta diária inventada (ver home.ts). */
export async function fetchHomeSummary(): Promise<HomeSummary> {
  const repo = getAttendanceRepository();
  const today = saoPauloDateISO();

  const [board, todaysOrders, catalog, activeGoal] = await Promise.all([
    fetchManagerBoard(),
    repo.listServiceOrdersVisitedOnDate(today),
    repo.listServiceCatalog(),
    fetchActiveGoal("consolidado", today),
  ]);

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));

  return summarizeHome({ boardColumns: board.columns, todaysOrders, deliveredToday: board.deliveredToday, servicePriceById, activeGoal });
}

export interface DayManagement {
  summary: HomeSummary;
  /** Só os cards com status `em_execucao` — mesmo dado de `fetchManagerBoard`, sem nova consulta. */
  emExecucao: ManagerBoardOrder[];
  /** Só os cards com status `pronto_entrega`. */
  prontos: ManagerBoardOrder[];
  /** Entradas do período selecionado (qualquer status atual), mais recente primeiro. */
  entradas: ManagerBoardOrder[];
  period: DayPeriodRange;
}

/**
 * Orquestrador da tela "Gestão do Dia" — os indicadores do topo (`summary`) são sempre de hoje;
 * só a lista de Entradas respeita o filtro de período (revisão histórica), porque não guardamos
 * histórico de status por dia — mostrar contagens "de ontem" seria inventar um retrato que não
 * temos.
 */
export async function fetchDayManagement(periodKey: DayPeriodKey = "hoje"): Promise<DayManagement> {
  const repo = getAttendanceRepository();
  const today = saoPauloDateISO();
  const period = resolveDayPeriod(periodKey, today);

  const [board, todaysOrders, catalog, activeGoal, entradas] = await Promise.all([
    fetchManagerBoard(),
    repo.listServiceOrdersVisitedOnDate(today),
    repo.listServiceCatalog(),
    fetchActiveGoal("consolidado", today),
    repo.listOrdersInRange(period.from, period.to),
  ]);

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));
  const summary = summarizeHome({ boardColumns: board.columns, todaysOrders, deliveredToday: board.deliveredToday, servicePriceById, activeGoal });

  return {
    summary,
    emExecucao: board.columns.find((c) => c.status === "em_execucao")?.orders ?? [],
    prontos: board.columns.find((c) => c.status === "pronto_entrega")?.orders ?? [],
    entradas: [...entradas].sort((a, b) => b.visitCreatedAt.localeCompare(a.visitCreatedAt)),
    period,
  };
}

/** Lista de veículos mais recentes com o cliente dono — base da tela "Veículos". */
export async function fetchRecentVehicles(limit = 50): Promise<RecentVehicleEntry[]> {
  return getAttendanceRepository().listRecentVehiclesWithCustomer(limit);
}

export interface TimelineFeed {
  entries: ManagerBoardOrder[];
  period: DayPeriodRange;
}

/** Feed geral de entradas filtrável por período — base da tela "Timeline" (versão dedicada, sem cap, da seção "Entradas" da Gestão do Dia). */
export async function fetchTimelineFeed(periodKey: DayPeriodKey = "hoje"): Promise<TimelineFeed> {
  const repo = getAttendanceRepository();
  const period = resolveDayPeriod(periodKey, saoPauloDateISO());
  const entries = await repo.listOrdersInRange(period.from, period.to);
  return { entries: [...entries].sort((a, b) => b.visitCreatedAt.localeCompare(a.visitCreatedAt)), period };
}

export interface OperationsCenter {
  generatedAt: string;
  /** `false` só quando não há nenhuma ordem ativa (qualquer status antes de `entregue`) — "Sem atendimentos em andamento". */
  isOperating: boolean;
  /** Total de ordens cuja visita aconteceu hoje, qualquer status — não confundir com as contagens por estágio de `summary`. */
  atendimentosHoje: number;
  summary: HomeSummary;
  /** Já vem ordenado do mais antigo (mesmo sort de `fetchManagerBoard`, por `updatedAt` — desde quando entrou no estágio atual). */
  emExecucao: ManagerBoardOrder[];
  aguardandoConferencia: ManagerBoardOrder[];
  prontos: ManagerBoardOrder[];
  timeline: OperationsEvent[];
  alerts: OperationalAlert[];
}

/**
 * Orquestrador da Central de Operações (`/operacao`) — visão ao vivo, sempre de hoje. Reaproveita
 * `fetchManagerBoard`/`summarizeHome` (mesmas consultas da Gestão do Dia, nenhuma duplicada) e
 * soma só o que falta: o feed de entradas de hoje (para a timeline) e os alertas derivados dos
 * mesmos cards já carregados.
 */
export async function fetchOperationsCenter(): Promise<OperationsCenter> {
  const repo = getAttendanceRepository();
  const today = saoPauloDateISO();

  const [board, todaysOrders, catalog, activeGoal, todaysEntries] = await Promise.all([
    fetchManagerBoard(),
    repo.listServiceOrdersVisitedOnDate(today),
    repo.listServiceCatalog(),
    fetchActiveGoal("consolidado", today),
    repo.listOrdersInRange(today, today),
  ]);

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));
  const summary = summarizeHome({ boardColumns: board.columns, todaysOrders, deliveredToday: board.deliveredToday, servicePriceById, activeGoal });

  const emExecucao = board.columns.find((c) => c.status === "em_execucao")?.orders ?? [];
  const aguardandoConferencia = board.columns.find((c) => c.status === "aguardando_conferencia")?.orders ?? [];
  const prontos = board.columns.find((c) => c.status === "pronto_entrega")?.orders ?? [];

  return {
    generatedAt: new Date().toISOString(),
    isOperating: board.columns.some((c) => c.orders.length > 0),
    atendimentosHoje: todaysOrders.length,
    summary,
    emExecucao,
    aguardandoConferencia,
    prontos,
    timeline: buildDayTimeline(todaysEntries),
    alerts: deriveOperationalAlerts({ emExecucao, aguardandoConferencia, prontos }),
  };
}

/** Linha do tempo com todas as visitas do cliente (qualquer veículo), mais recente primeiro. */
export async function fetchCustomerTimeline(customerId: string): Promise<TimelineEntry[]> {
  const repo = getAttendanceRepository();
  const [visits, diagnostics, recommendations, orders, catalog] = await Promise.all([
    repo.listVisitsByCustomer(customerId),
    repo.listDiagnosticsByCustomer(customerId),
    repo.listRecommendationsByCustomer(customerId),
    repo.listServiceOrdersByCustomer(customerId),
    repo.listServiceCatalog(),
  ]);
  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));
  return summarizeTimeline({ visits, diagnostics, recommendations, orders, servicePriceById });
}

export interface VehicleDetail {
  vehicle: Vehicle;
  customer: Customer;
  entries: TimelineEntry[];
  totalPhotos: number;
}

/**
 * Tudo que a Timeline do Veículo precisa — mesmo cliente pode ter vários veículos, cada um com a
 * sua própria linha do tempo. `totalPhotos` soma as fotos de todos os diagnósticos do veículo
 * (contagem real, nunca estimada — a foto em si continua sem upload nesta sprint).
 */
export async function fetchVehicleTimeline(vehicleId: string): Promise<VehicleDetail | null> {
  const repo = getAttendanceRepository();
  const vehicle = await repo.getVehicle(vehicleId);
  if (!vehicle) return null;

  const [customer, visits, catalog] = await Promise.all([repo.getCustomer(vehicle.customerId), repo.listVisitsByVehicle(vehicleId), repo.listServiceCatalog()]);
  if (!customer) return null;

  const [diagnostics, recommendationLists, orders] = await Promise.all([
    Promise.all(visits.map((v) => repo.getDiagnosticByVisit(v.id))),
    Promise.all(visits.map((v) => repo.listRecommendationsByVisit(v.id))),
    Promise.all(visits.map((v) => repo.getServiceOrderByVisit(v.id))),
  ]);
  const foundDiagnostics = diagnostics.filter((d): d is NonNullable<typeof d> => d !== null);

  const photoLists = await Promise.all(foundDiagnostics.map((d) => repo.listPhotosByDiagnostic(d.id)));
  const totalPhotos = photoLists.reduce((sum, photos) => sum + photos.length, 0);

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));
  const entries = summarizeTimeline({
    visits,
    diagnostics: foundDiagnostics,
    recommendations: recommendationLists.flat(),
    orders: orders.filter((o): o is NonNullable<typeof o> => o !== null),
    servicePriceById,
  });

  return { vehicle, customer, entries, totalPhotos };
}
