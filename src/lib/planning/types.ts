/**
 * Planejamento Operacional (Missão 20) — central de organização do dia seguinte e dos próximos
 * dias. Não é um calendário: o objetivo é responder quem vem, quando, qual serviço, quanto tempo
 * ocupa, quanta capacidade resta e quais clientes merecem atenção — sempre com dado real, nunca
 * inventado.
 */

export type AppointmentStatus = "agendado" | "confirmado" | "em_andamento" | "concluido" | "cancelado" | "reagendado";

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ["agendado", "confirmado", "em_andamento", "concluido", "cancelado", "reagendado"];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  reagendado: "Reagendado",
};

/** Status que ainda representam ocupação real da agenda — usados nos cálculos de capacidade. */
export const OCCUPYING_STATUSES: AppointmentStatus[] = ["agendado", "confirmado", "em_andamento", "concluido"];

export interface Appointment {
  id: string;
  customerId: string;
  vehicleId: string;
  serviceId: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  customerId: string;
  vehicleId: string;
  serviceId: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  notes?: string | null;
}

/**
 * Sinalizadores de cliente — só aparecem quando há histórico real correspondente (nunca
 * calculados por suposição). `vip` foi deliberadamente omitido: não existe regra de negócio
 * formal para defini-lo (mesma decisão já tomada na Missão 18 para o Assistente do Gerente).
 */
export type ClientSignalId = "recorrente" | "primeira_visita" | "retornando" | "servicos_pendentes" | "recomendacao_pendente" | "premium_detail" | "vitrificacao_historico";

export interface ClientSignal {
  id: ClientSignalId;
  label: string;
}

export const CLIENT_SIGNAL_LABELS: Record<ClientSignalId, string> = {
  recorrente: "Cliente recorrente",
  primeira_visita: "Primeira visita",
  retornando: "Retornando após muito tempo",
  servicos_pendentes: "Serviço em andamento",
  recomendacao_pendente: "Recomendação técnica pendente",
  premium_detail: "Já fez Premium Detail",
  vitrificacao_historico: "Vitrificação no histórico",
};

/** Visão pronta para a lista — já com os dados de exibição resolvidos numa única busca. */
export interface AppointmentView {
  id: string;
  scheduledAt: string;
  status: AppointmentStatus;
  customerId: string;
  customerName: string | null;
  phone: string | null;
  vehicleId: string;
  vehicleLabel: string;
  plate: string | null;
  serviceId: string;
  serviceName: string;
  expectedDurationMinutes: number | null;
  notes: string | null;
  signals: ClientSignal[];
}

export interface PlanningDay {
  dateIso: string;
  label: string;
  appointments: AppointmentView[];
}

export type PlanningRangeKey = "hoje" | "amanha" | "semana" | "proxima_semana" | "todos";

export const PLANNING_RANGE_LABELS: Record<PlanningRangeKey, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  semana: "Esta semana",
  proxima_semana: "Próxima semana",
  todos: "Todos",
};

/** Cartão de destaque do próximo compromisso — só dado real, nunca preenchido por suposição. */
export interface NextClientCard {
  appointment: AppointmentView;
  lastVisitAt: string | null;
  lastServiceNames: string[];
  lastDiagnosticIssues: string[];
  pendingRecommendations: { category: string; observations: string | null }[];
}

/** Configuração real de capacidade diária — definida pelo gerente, nunca inventada. */
export interface CapacityConfig {
  id: string;
  boxesCount: number;
  dailyOperatingMinutes: number;
}

export interface SetCapacityConfigInput {
  boxesCount: number;
  dailyOperatingMinutes: number;
}

/** `configured: false` sempre que não houver `CapacityConfig` ativa — nunca um valor padrão inventado. */
export type CapacitySummary =
  | { configured: false }
  | {
      configured: true;
      boxesCount: number;
      dailyOperatingMinutes: number;
      dailyCapacityMinutes: number;
      committedMinutes: number;
      availableMinutes: number;
      percentOccupied: number;
      estimatedBoxesOccupied: number;
      appointmentsMissingDuration: number;
    };

export interface ForecastEntry {
  serviceName: string;
  canFit: number;
}

/** `calculable: false` sempre que não houver amostra histórica suficiente ou capacidade configurada. */
export type Forecast = { calculable: false } | { calculable: true; entries: ForecastEntry[] };

export interface TomorrowPreparation {
  vehicleCount: number;
  serviceCount: number;
  totalPredictedMinutes: number;
  appointmentsMissingDuration: number;
  capacity: CapacitySummary;
  forecast: Forecast;
}

export interface PlanningBoard {
  days: PlanningDay[];
  tomorrowPreparation: TomorrowPreparation;
  nextClient: NextClientCard | null;
}
