import type { DbOrTx } from "@/db/client";
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
  /**
   * `runner` opcional (Missão de Atomicidade Planejamento) — quando fornecido, participa da
   * transação já aberta pelo chamador em vez de abrir conexão própria via `getDb()`. Omitido,
   * comportamento idêntico a antes desta missão.
   */
  createAppointment(input: CreateAppointmentInput, runner?: DbOrTx): Promise<Appointment>;
  getAppointment(id: string): Promise<Appointment | null>;
  /** Intervalo de datas [fromIso, toIso], inclusive, comparado pelo calendário de São Paulo. */
  listAppointmentsInRange(fromIso: string, toIso: string): Promise<AppointmentRow[]>;
  /** Todo agendamento a partir de `fromIso` (inclusive), sem limite superior — filtro "Todos". */
  listUpcoming(fromIso: string): Promise<AppointmentRow[]>;
  /**
   * Missão 19 (enrichment read-only de conflito de placa) — em lote (1 consulta para todos os
   * `vehicleId`s, nunca N+1), agendamentos "relevantes" desses veículos: status `agendado`,
   * `confirmado`, `em_andamento` ou `reagendado` (nunca `cancelado` nem `concluido` — passado,
   * não relevante para esta tela) E (`scheduledAt >= nowIso` OU status `em_andamento`). Retorna
   * TODOS os agendamentos relevantes encontrados, ordenados por `scheduledAt` — a escolha do "mais
   * próximo" por veículo é responsabilidade de quem consome (ver `plateConflictEnrichment.ts`),
   * não desta consulta.
   */
  getRelevantAppointmentsByVehicleIds(vehicleIds: string[], nowIso: string): Promise<AppointmentRow[]>;
  /** Busca por nome do cliente, telefone, placa ou veículo — só agendamentos a partir de `fromIso`. */
  searchAppointments(query: string, fromIso: string): Promise<AppointmentRow[]>;
  updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment>;

  /** No máximo uma configuração ativa por vez — a mais recente vale (mesmo espírito de `goals`). */
  getActiveCapacityConfig(): Promise<CapacityConfig | null>;
  setCapacityConfig(input: SetCapacityConfigInput): Promise<CapacityConfig>;

  /** Ordens entregues com exatamente 1 serviço aprovado — base real para duração média por serviço. */
  listCompletedSingleServiceOrders(): Promise<CompletedOrderSample[]>;

  /**
   * Missão 3.1 — `services.estimated_duration_minutes` dos ids pedidos, usado só como fallback
   * quando um agendamento não tem `expectedDurationMinutes` próprio. `null` no valor = serviço
   * sem duração cadastrada (nunca inventado); ids não encontrados simplesmente não aparecem no mapa.
   */
  getServiceEstimatedDurations(serviceIds: string[]): Promise<Record<string, number | null>>;
}
