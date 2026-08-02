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

/**
 * Diagnóstico Técnico Inteligente (Missão 19) — checklist estruturado, sempre de fora para dentro:
 * Pintura → Rodas → Pneus → Vidros → Motor → Interior (`DIAGNOSTIC_AREAS`, ordem obrigatória do
 * negócio). Cada área tem seu próprio formato porque o negócio especificou critérios diferentes
 * por área — nunca um formato genérico "condição + lista de problema" inventado aqui.
 */
export type IssueLevel = "nenhuma" | "leve" | "media" | "alta";
export const ISSUE_LEVELS: IssueLevel[] = ["nenhuma", "leve", "media", "alta"];

export interface PaintAssessment {
  chuvaAcida: IssueLevel;
  riscos: IssueLevel;
  hologramas: IssueLevel;
  manchas: IssueLevel;
}
export function emptyPaintAssessment(): PaintAssessment {
  return { chuvaAcida: "nenhuma", riscos: "nenhuma", hologramas: "nenhuma", manchas: "nenhuma" };
}

export interface WheelsAssessment {
  sujeiraPesada: boolean;
  contaminacao: boolean;
  oxidacao: boolean;
  freioImpregnado: boolean;
}
export function emptyWheelsAssessment(): WheelsAssessment {
  return { sujeiraPesada: false, contaminacao: false, oxidacao: false, freioImpregnado: false };
}

/** Sem checklist próprio especificado pelo negócio para Pneus — só condição geral (nunca um problema inventado). */
export interface TiresAssessment {
  condition: Condition | null;
}
export function emptyTiresAssessment(): TiresAssessment {
  return { condition: null };
}

export interface GlassAssessment {
  contaminacao: boolean;
  marcasDagua: boolean;
  /** Fato, não problema — cristalização já existe no vidro (usado para não sugerir de novo). */
  cristalizacaoExistente: boolean;
}
export function emptyGlassAssessment(): GlassAssessment {
  return { contaminacao: false, marcasDagua: false, cristalizacaoExistente: false };
}

export type EngineCondition = "muito_limpo" | "normal" | "sujo" | "muito_sujo";
export const ENGINE_CONDITIONS: EngineCondition[] = ["muito_limpo", "normal", "sujo", "muito_sujo"];
export const ENGINE_CONDITION_LABELS: Record<EngineCondition, string> = {
  muito_limpo: "Muito limpo",
  normal: "Normal",
  sujo: "Sujo",
  muito_sujo: "Muito sujo",
};
export interface EngineAssessment {
  condition: EngineCondition | null;
}
export function emptyEngineAssessment(): EngineAssessment {
  return { condition: null };
}

export interface InteriorChecklist {
  plasticos: boolean;
  couro: boolean;
  tecidos: boolean;
  tapetes: boolean;
  teto: boolean;
  portaMalas: boolean;
  vidrosInternos: boolean;
  odor: boolean;
  pelosAnimais: boolean;
  areia: boolean;
}
export function emptyInteriorChecklist(): InteriorChecklist {
  return { plasticos: false, couro: false, tecidos: false, tapetes: false, teto: false, portaMalas: false, vidrosInternos: false, odor: false, pelosAnimais: false, areia: false };
}

/** Ordem obrigatória do negócio — sempre de fora para dentro. Nunca reordenar. */
export const DIAGNOSTIC_AREAS = ["pintura", "rodas", "pneus", "vidros", "motor", "interior"] as const;
export type DiagnosticArea = (typeof DIAGNOSTIC_AREAS)[number];
export const DIAGNOSTIC_AREA_LABELS: Record<DiagnosticArea, string> = {
  pintura: "Pintura",
  rodas: "Rodas",
  pneus: "Pneus",
  vidros: "Vidros",
  motor: "Motor",
  interior: "Interior",
};

export interface TechnicalDiagnosticInput {
  pintura: PaintAssessment;
  rodas: WheelsAssessment;
  pneus: TiresAssessment;
  vidros: GlassAssessment;
  motor: EngineAssessment;
  interior: InteriorChecklist;
}
export function emptyTechnicalDiagnostic(): TechnicalDiagnosticInput {
  return { pintura: emptyPaintAssessment(), rodas: emptyWheelsAssessment(), pneus: emptyTiresAssessment(), vidros: emptyGlassAssessment(), motor: emptyEngineAssessment(), interior: emptyInteriorChecklist() };
}

/** `url` sempre `null` nesta sprint — estrutura preparada, sem upload real (decisão do escopo). */
export interface DiagnosticPhoto {
  id: string;
  area: DiagnosticArea;
  url: string | null;
  caption: string | null;
}

export interface AddPhotoInput {
  diagnosticId: string;
  area: DiagnosticArea;
  caption?: string | null;
}

export interface Diagnostic extends TechnicalDiagnosticInput {
  id: string;
  serviceVisitId: string;
  observations: string | null;
  photos: DiagnosticPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveDiagnosticInput extends TechnicalDiagnosticInput {
  serviceVisitId: string;
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
  /** IDs reais para linkar a ordem ao cliente/veículo/visita (ex.: Assistente do Gerente, timeline). */
  customerId: string;
  vehicleId: string;
  visitId: string;
  customerName: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  updatedAt: string;
  /** `service_visits.created_at` — quando o carro entrou, base real para "tempo desde entrada" (nunca `updatedAt`, que é só a última mudança de status). */
  visitCreatedAt: string;
  /** Nomes dos serviços aprovados — vazio em `recebido`/`diagnostico`, quando ainda não há itens. */
  serviceNames: string[];
  /** Soma do preço padrão dos itens aprovados — `0` quando ainda não há itens (nunca um valor estimado). */
  totalValue: number;
}

/** Detalhe consolidado de um veículo/atendimento — tudo que a tela "Detalhe do Veículo" precisa, numa só busca. */
export interface OrderDetail {
  order: ServiceOrder;
  visit: ServiceVisit;
  customer: Customer;
  vehicle: Vehicle;
  diagnostic: Diagnostic | null;
  recommendations: TechnicalRecommendation[];
  /** Soma do preço padrão dos itens aprovados — mesma regra de `ManagerBoardOrder.totalValue`, é o "valor de tabela" usado no registro de desconto. */
  totalValue: number;
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
    /** Entregues hoje — mesma contagem da tela Entregas. */
    entregue: number;
  };
  dailyRevenue: number;
  /**
   * Valor médio das ordens de hoje que já têm ao menos um item aprovado — `null` quando nenhuma
   * ordem de hoje tem itens ainda (nunca `0`, que sugeriria ticket médio real igual a zero).
   */
  averageTicket: number | null;
  /**
   * Minutos médios entre entrada e entrega das ordens entregues hoje — `null` quando nada foi
   * entregue hoje ainda (não estimado a partir de ordens em aberto).
   */
  averageServiceDurationMinutes: number | null;
  goal: HomeGoalEstimate | null;
}
