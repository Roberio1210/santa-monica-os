import type { Appointment, AppointmentStatus, CapacityConfig, CreateAppointmentInput, SetCapacityConfigInput } from "@/lib/planning/types";

/** Linha já com os dados de exibição resolvidos (nome/telefone/veículo/placa/serviço) — nunca busca N+1 na UI. */
export interface AppointmentRow {
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
}

export interface CompletedOrderSample {
  serviceNames: string[];
  visitCreatedAt: string;
  updatedAt: string;
}

/**
 * Interface única do Planejamento Operacional — mesmo padrão de `AttendanceRepository`/
 * `ManagerAssistantRepository`: uma interface, duas implementações (memory/postgres), escolhidas
 * por `repository-factory.ts` via `getStorageMode()`.
 */
export interface PlanningRepository {
  createAppointment(input: CreateAppointmentInput): Promise<Appointment>;
  getAppointment(id: string): Promise<Appointment | null>;
  /** Intervalo de datas [fromIso, toIso], inclusive, comparado pelo calendário de São Paulo. */
  listAppointmentsInRange(fromIso: string, toIso: string): Promise<AppointmentRow[]>;
  /** Todo agendamento a partir de `fromIso` (inclusive), sem limite superior — filtro "Todos". */
  listUpcoming(fromIso: string): Promise<AppointmentRow[]>;
  /** Busca por nome do cliente, telefone, placa ou veículo — só agendamentos a partir de `fromIso`. */
  searchAppointments(query: string, fromIso: string): Promise<AppointmentRow[]>;
  updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment>;

  /** No máximo uma configuração ativa por vez — a mais recente vale (mesmo espírito de `goals`). */
  getActiveCapacityConfig(): Promise<CapacityConfig | null>;
  setCapacityConfig(input: SetCapacityConfigInput): Promise<CapacityConfig>;

  /** Ordens entregues com exatamente 1 serviço aprovado — base real para duração média por serviço. */
  listCompletedSingleServiceOrders(): Promise<CompletedOrderSample[]>;
}
