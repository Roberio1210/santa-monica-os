/**
 * Módulo Atendimento Inteligente — primeira funcionalidade de produção do Santa Monica OS.
 * Fluxo: cliente chega → busca automática → histórico ou cadastro rápido → diagnóstico técnico →
 * recomendações → serviços aprovados → Ordem de Serviço. Nunca vende — apenas orienta e organiza.
 */

export interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  cpf: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  cpf?: string | null;
}

export interface Vehicle {
  id: string;
  customerId: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleInput {
  customerId: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
}

export interface ServiceVisit {
  id: string;
  customerId: string;
  vehicleId: string;
  mileageAtVisit: number | null;
  createdAt: string;
}

/** As quatro únicas condições possíveis — nunca um quinto valor inventado na UI. */
export type Condition = "excelente" | "boa" | "regular" | "ruim";
export const CONDITIONS: Condition[] = ["excelente", "boa", "regular", "ruim"];
export const CONDITION_LABELS: Record<Condition, string> = {
  excelente: "Excelente",
  boa: "Boa",
  regular: "Regular",
  ruim: "Ruim",
};

export type Severity = "leve" | "moderada" | "severa";
export const SEVERITIES: Severity[] = ["leve", "moderada", "severa"];
export const SEVERITY_LABELS: Record<Severity, string> = {
  leve: "Leve",
  moderada: "Moderada",
  severa: "Severa",
};

export interface DiagnosticProblem {
  type: string;
  severity: Severity;
}

/** Uma área avaliada — condição pode ser `null` até o gerente selecionar (nunca assumida). */
export interface AreaAssessment {
  condition: Condition | null;
  problems: DiagnosticProblem[];
}

export function emptyAreaAssessment(): AreaAssessment {
  return { condition: null, problems: [] };
}

export const EXTERIOR_AREAS = ["pintura", "rodas", "pneus", "plasticos", "vidros", "farois", "motor", "chassi"] as const;
export type ExteriorArea = (typeof EXTERIOR_AREAS)[number];
export const EXTERIOR_AREA_LABELS: Record<ExteriorArea, string> = {
  pintura: "Pintura",
  rodas: "Rodas",
  pneus: "Pneus",
  plasticos: "Plásticos",
  vidros: "Vidros",
  farois: "Faróis",
  motor: "Motor",
  chassi: "Chassi",
};
export type ExteriorAssessment = Record<ExteriorArea, AreaAssessment>;

export const INTERIOR_AREAS = ["bancos", "painel", "carpete", "portaMalas", "teto", "console", "portas"] as const;
export type InteriorArea = (typeof INTERIOR_AREAS)[number];
export const INTERIOR_AREA_LABELS: Record<InteriorArea, string> = {
  bancos: "Bancos",
  painel: "Painel",
  carpete: "Carpete",
  portaMalas: "Porta-malas",
  teto: "Teto",
  console: "Console",
  portas: "Portas",
};
export type InteriorAssessment = Record<InteriorArea, AreaAssessment>;

export function emptyExteriorAssessment(): ExteriorAssessment {
  return Object.fromEntries(EXTERIOR_AREAS.map((area) => [area, emptyAreaAssessment()])) as ExteriorAssessment;
}

export function emptyInteriorAssessment(): InteriorAssessment {
  return Object.fromEntries(INTERIOR_AREAS.map((area) => [area, emptyAreaAssessment()])) as InteriorAssessment;
}

export type PhotoStage = "antes" | "durante" | "depois";
export const PHOTO_STAGES: PhotoStage[] = ["antes", "durante", "depois"];
export const PHOTO_STAGE_LABELS: Record<PhotoStage, string> = {
  antes: "Antes",
  durante: "Durante",
  depois: "Depois",
};

/** `url` sempre `null` nesta sprint — estrutura preparada, sem upload real (decisão do escopo). */
export interface DiagnosticPhoto {
  id: string;
  stage: PhotoStage;
  url: string | null;
  caption: string | null;
}

export interface AddPhotoInput {
  diagnosticId: string;
  stage: PhotoStage;
  caption?: string | null;
}

export interface Diagnostic {
  id: string;
  serviceVisitId: string;
  exterior: ExteriorAssessment;
  interior: InteriorAssessment;
  observations: string | null;
  photos: DiagnosticPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveDiagnosticInput {
  serviceVisitId: string;
  exterior: ExteriorAssessment;
  interior: InteriorAssessment;
  observations?: string | null;
}

export interface TechnicalRecommendation {
  id: string;
  serviceVisitId: string;
  category: string;
  observations: string | null;
  createdAt: string;
}

export interface AddRecommendationInput {
  serviceVisitId: string;
  category: string;
  observations?: string | null;
}

/**
 * Pipeline operacional completo — a ordem nasce junto com a visita (`recebido`), muito antes de
 * ter serviços aprovados. `diagnostico` cobre o intervalo entre o diagnóstico salvo e a aprovação
 * dos serviços. Nunca pula etapa: cada avanço é sempre para o próximo item deste array.
 */
export type ServiceOrderStatus = "recebido" | "diagnostico" | "aguardando_execucao" | "em_execucao" | "aguardando_conferencia" | "pronto_entrega" | "entregue";

export const SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [
  "recebido",
  "diagnostico",
  "aguardando_execucao",
  "em_execucao",
  "aguardando_conferencia",
  "pronto_entrega",
  "entregue",
];

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  recebido: "Recebido",
  diagnostico: "Diagnóstico",
  aguardando_execucao: "Aguardando Execução",
  em_execucao: "Em Execução",
  aguardando_conferencia: "Aguardando Conferência",
  pronto_entrega: "Pronto para Entrega",
  entregue: "Entregue",
};

export interface ServiceOrderItem {
  id: string;
  serviceOrderId: string;
  serviceId: string;
  serviceName: string;
  notes: string | null;
}

export interface ServiceOrder {
  id: string;
  serviceVisitId: string;
  status: ServiceOrderStatus;
  items: ServiceOrderItem[];
  createdAt: string;
  updatedAt: string;
}


/**
 * Contexto exibido na Tela 1 quando um cliente/veículo já existe. `activeProtections` sempre
 * `[]` nesta sprint — depende de uma regra de negócio (qual serviço garante quanto tempo de
 * proteção) ainda não definida; nunca inventada aqui. Ver ADR em
 * docs/atendimento-inteligente-architecture.md.
 */
export interface CustomerHistorySummary {
  customer: Customer;
  vehicles: Vehicle[];
  lastVisitAt: string | null;
  lastServices: string[];
  /** Valor só da última Ordem de Serviço — nunca confundir com `totalSpent` (soma histórica). */
  lastOrderValue: number | null;
  totalSpent: number;
  observations: string[];
  pendingRecommendations: TechnicalRecommendation[];
  activeProtections: VehicleProtection[];
}

/** Estrutura preparada, sem escritor nesta sprint — ver CustomerHistorySummary. */
export interface VehicleProtection {
  vehicleId: string;
  description: string;
  validUntil: string;
}

export interface ManagerBoardColumn {
  status: ServiceOrderStatus;
  label: string;
  orders: ManagerBoardOrder[];
}

export interface ManagerBoardOrder {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  customerName: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  updatedAt: string;
  /** `service_visits.created_at` — quando o carro entrou, base real para "tempo desde entrada" (nunca `updatedAt`, que é só a última mudança de status). */
  visitCreatedAt: string;
  /** Nomes dos serviços aprovados — vazio em `recebido`/`diagnostico`, quando ainda não há itens. */
  serviceNames: string[];
}

/** Detalhe consolidado de um veículo/atendimento — tudo que a tela "Detalhe do Veículo" precisa, numa só busca. */
export interface OrderDetail {
  order: ServiceOrder;
  visit: ServiceVisit;
  customer: Customer;
  vehicle: Vehicle;
  diagnostic: Diagnostic | null;
  recommendations: TechnicalRecommendation[];
}

/**
 * Meta do dia é sempre derivada de uma meta mensal real (`goals`), dividida pelos dias do
 * período — nunca uma meta diária inventada. `null` quando não há meta ativa configurada.
 */
export interface HomeGoalEstimate {
  label: string;
  dailyTargetEstimate: number;
}

export interface HomeSummary {
  countsToday: {
    /** Recém-recebidos, ainda sem diagnóstico. */
    previstos: number;
    /** Diagnóstico feito + aguardando início da execução — ambos "esperando a equipe começar". */
    aguardandoAtendimento: number;
    emExecucao: number;
    aguardandoConferencia: number;
    prontoEntrega: number;
  };
  dailyRevenue: number;
  goal: HomeGoalEstimate | null;
}
