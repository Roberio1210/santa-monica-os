import "server-only";
import { getDb, type DbOrTx } from "@/db/client";
import { fetchCustomerSearchResult, registerQuickCustomerAndVehicle, type QuickRegisterInput } from "@/lib/attendance/service";
import type { Customer, CustomerHistorySummary, Vehicle } from "@/lib/attendance/types";
import { checkAvailability, resolveCandidateDuration } from "@/lib/planning/availability";
import { computeAverageDurationByServiceName, computeCapacitySummary, computeForecast, computeTomorrowPreparation } from "@/lib/planning/capacity";
import { deriveClientSignals } from "@/lib/planning/clientSignals";
import {
  computeOccupiedNow,
  computeSimultaneousOccupancyMap,
  findNextAvailableSlot,
  resolveExpedienteWindow,
  type ResolvedDurationAppointment,
} from "@/lib/planning/dayView";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import type { AppointmentRow } from "@/lib/planning/repository";
import {
  OCCUPYING_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentView,
  type AvailabilityCheckResult,
  type AvailabilityRequest,
  type CapacityConfig,
  type ClientSignal,
  type CreateAppointmentInput,
  type DayAppointmentView,
  type DayView,
  type NextClientCard,
  type OccupyingAppointmentForCheck,
  type PlanningBoard,
  type PlanningDay,
  type PlanningRangeKey,
  type SetCapacityConfigInput,
} from "@/lib/planning/types";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatDateLabel(dateIso: string, todayIso: string, tomorrowIso: string): string {
  if (dateIso === todayIso) return "Hoje";
  if (dateIso === tomorrowIso) return "Amanhã";
  const d = new Date(`${dateIso}T12:00:00Z`);
  const weekday = WEEKDAY_LABELS[d.getUTCDay()];
  const [, month, day] = dateIso.split("-");
  return `${weekday}, ${day}/${month}`;
}

async function buildClientSignals(customerId: string): Promise<{ signals: ClientSignal[]; history: CustomerHistorySummary | null }> {
  const result = await fetchCustomerSearchResult(customerId);
  if (!result) return { signals: [], history: null };
  const { history } = result;
  const daysSinceLastVisit = history.lastVisitAt ? Math.floor((Date.now() - Date.parse(history.lastVisitAt)) / 86_400_000) : null;
  const signals = deriveClientSignals({
    visitCount: history.visitCount,
    daysSinceLastVisit,
    hasOpenOrder: history.hasOpenOrder,
    hasPendingRecommendation: history.pendingRecommendations.length > 0,
    purchasedServiceNames: history.purchasedServiceNames,
  });
  return { signals, history };
}

async function toView(row: AppointmentRow): Promise<AppointmentView> {
  const { signals } = await buildClientSignals(row.customerId);
  return { ...row, signals };
}

function groupByDate(rows: AppointmentRow[]): Map<string, AppointmentRow[]> {
  const map = new Map<string, AppointmentRow[]>();
  for (const row of rows) {
    const day = saoPauloDateISO(new Date(row.scheduledAt));
    const list = map.get(day) ?? [];
    list.push(row);
    map.set(day, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return map;
}

async function buildDays(dates: string[], rowsByDate: Map<string, AppointmentRow[]>, todayIso: string, tomorrowIso: string): Promise<PlanningDay[]> {
  return Promise.all(
    dates.map(async (dateIso) => ({
      dateIso,
      label: formatDateLabel(dateIso, todayIso, tomorrowIso),
      appointments: await Promise.all((rowsByDate.get(dateIso) ?? []).map(toView)),
    })),
  );
}

/** Nomes reais dos serviços de categoria "Pacote" no catálogo — nunca uma lista fixa inventada. */
async function fetchPackageServiceNames(): Promise<string[]> {
  const catalog = await getAttendanceRepository().listServiceCatalog();
  return catalog.filter((s) => s.category === "Pacote").map((s) => s.name);
}

export async function fetchPlanningBoard(rangeKey: PlanningRangeKey | null): Promise<PlanningBoard> {
  const repo = getPlanningRepository();
  const todayIso = saoPauloDateISO();
  const tomorrowIso = addDaysIso(todayIso, 1);

  let days: PlanningDay[];
  if (rangeKey === "hoje") {
    const rows = await repo.listAppointmentsInRange(todayIso, todayIso);
    days = await buildDays([todayIso], groupByDate(rows), todayIso, tomorrowIso);
  } else if (rangeKey === "amanha") {
    const rows = await repo.listAppointmentsInRange(tomorrowIso, tomorrowIso);
    days = await buildDays([tomorrowIso], groupByDate(rows), todayIso, tomorrowIso);
  } else if (rangeKey === "semana") {
    const endIso = addDaysIso(todayIso, 6);
    const rows = await repo.listAppointmentsInRange(todayIso, endIso);
    const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(todayIso, i));
    days = await buildDays(dates, groupByDate(rows), todayIso, tomorrowIso);
  } else if (rangeKey === "proxima_semana") {
    const startIso = addDaysIso(todayIso, 7);
    const endIso = addDaysIso(todayIso, 13);
    const rows = await repo.listAppointmentsInRange(startIso, endIso);
    const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(startIso, i));
    days = await buildDays(dates, groupByDate(rows), todayIso, tomorrowIso);
  } else if (rangeKey === "todos") {
    const rows = await repo.listUpcoming(todayIso);
    const grouped = groupByDate(rows);
    const dates = Array.from(grouped.keys()).sort();
    days = await buildDays(dates, grouped, todayIso, tomorrowIso);
  } else {
    // Padrão da Tela Principal: Hoje, Amanhã e os 5 dias seguintes — sempre juntos.
    const endIso = addDaysIso(todayIso, 6);
    const rows = await repo.listAppointmentsInRange(todayIso, endIso);
    const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(todayIso, i));
    days = await buildDays(dates, groupByDate(rows), todayIso, tomorrowIso);
  }

  const [tomorrowPreparation, nextClient] = await Promise.all([fetchTomorrowPreparation(), fetchNextClient()]);

  return { days, tomorrowPreparation, nextClient };
}

/**
 * Missão Z3 (Zézinho generativo) — generaliza o cálculo que `fetchTomorrowPreparation` já fazia
 * só para "amanhã", para qualquer data (hoje incluído) — usado pela tool `agenda_availability`
 * para responder "tem vaga hoje?"/"consigo encaixar uma SUV?" com a mesma fonte real usada pelo
 * /planejamento, nunca uma agenda mock. `dateIso` no formato YYYY-MM-DD.
 */
export async function fetchCapacityForDate(dateIso: string): Promise<PlanningBoard["tomorrowPreparation"]> {
  const repo = getPlanningRepository();

  const [rows, config, completedOrders, packageNames] = await Promise.all([
    repo.listAppointmentsInRange(dateIso, dateIso),
    repo.getActiveCapacityConfig(),
    repo.listCompletedSingleServiceOrders(),
    fetchPackageServiceNames(),
  ]);

  const occupying = rows.filter((r) => OCCUPYING_STATUSES.includes(r.status));
  const capacity = computeCapacitySummary(config, occupying);
  const durationStats = computeAverageDurationByServiceName(completedOrders);
  const forecast = computeForecast(capacity, durationStats, packageNames);

  const views = await Promise.all(occupying.map(toView));
  return computeTomorrowPreparation(views, capacity, forecast);
}

/**
 * Missão 40 (Fase 1 — Agenda Operacional Visual) — visão de UM dia para a nova tela principal de
 * `/planejamento`. Reaproveita `fetchCapacityForDate` para a carga prevista (nenhuma fórmula
 * paralela) e a mesma resolução de duração (própria → catálogo → indeterminada) já usada por
 * `checkAvailabilityForRequest`, aplicada a TODOS os agendamentos do dia (não só aos que ocupam
 * capacidade) para que o card de cada agendamento mostre o horário final real sempre que possível.
 */
export async function fetchDayView(dateIso: string): Promise<DayView> {
  const repo = getPlanningRepository();
  const todayIso = saoPauloDateISO();

  const [rows, config, capacityPrep] = await Promise.all([repo.listAppointmentsInRange(dateIso, dateIso), repo.getActiveCapacityConfig(), fetchCapacityForDate(dateIso)]);

  const serviceIdsNeedingFallback = new Set(rows.filter((r) => r.expectedDurationMinutes === null).map((r) => r.serviceId));
  const durationFallbacks = serviceIdsNeedingFallback.size > 0 ? await repo.getServiceEstimatedDurations(Array.from(serviceIdsNeedingFallback)) : ({} as Record<string, number | null>);

  const resolvedById = new Map<string, number | null>(rows.map((row) => [row.id, resolveCandidateDuration(row.expectedDurationMinutes, durationFallbacks[row.serviceId] ?? null)]));

  const occupyingRows = rows.filter((r) => OCCUPYING_STATUSES.includes(r.status));
  const resolvedOccupying: ResolvedDurationAppointment[] = occupyingRows.map((row) => ({ id: row.id, scheduledAt: row.scheduledAt, durationMinutes: resolvedById.get(row.id) ?? null }));

  const nowMs = Date.now();
  const occupiedNow = computeOccupiedNow(resolvedOccupying, nowMs);
  const simultaneousById = computeSimultaneousOccupancyMap(resolvedOccupying);

  // Missão 43 — um dia estritamente anterior a hoje nunca tem "próxima disponibilidade" útil;
  // decidido ANTES de chamar `findNextAvailableSlot` (que sozinha não distingue isso de "hoje,
  // fora do expediente" — ver o comentário dela em `dayView.ts`). Nenhuma regra de disponibilidade
  // nova: só evita reaproveitar "Expediente encerrado" para um dia que já passou por completo.
  const nextAvailability = dateIso < todayIso
    ? ({ status: "dia_encerrado" } as const)
    : !config
      ? ({ status: "nao_configurado" } as const)
      : (() => {
          const { startMs, endMs } = resolveExpedienteWindow(dateIso, config.dailyOperatingMinutes);
          return findNextAvailableSlot(resolvedOccupying, { boxesCount: config.boxesCount }, { nowMs, expedienteStartMs: startMs, expedienteEndMs: endMs, granularityMinutes: 15 });
        })();

  const views = await Promise.all(rows.map(toView));
  views.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const appointments: DayAppointmentView[] = views.map((view) => {
    const resolvedDurationMinutes = resolvedById.get(view.id) ?? null;
    const endAt = resolvedDurationMinutes !== null ? new Date(Date.parse(view.scheduledAt) + resolvedDurationMinutes * 60_000).toISOString() : null;
    return { ...view, resolvedDurationMinutes, endAt, simultaneousCount: simultaneousById.get(view.id) ?? null };
  });

  return {
    dateIso,
    isToday: dateIso === todayIso,
    appointments,
    appointmentCount: rows.length,
    occupiedNowCount: occupiedNow.occupiedCount,
    occupiedNowIndeterminateCount: occupiedNow.indeterminateCount,
    capacity: capacityPrep.capacity,
    nextAvailability,
  };
}

async function fetchTomorrowPreparation(): Promise<PlanningBoard["tomorrowPreparation"]> {
  const todayIso = saoPauloDateISO();
  const tomorrowIso = addDaysIso(todayIso, 1);
  return fetchCapacityForDate(tomorrowIso);
}

export async function fetchNextClient(): Promise<NextClientCard | null> {
  const repo = getPlanningRepository();
  const todayIso = saoPauloDateISO();
  const rows = await repo.listUpcoming(todayIso);
  const nowIso = new Date().toISOString();

  const upcoming = rows
    .filter((r) => (r.status === "agendado" || r.status === "confirmado" || r.status === "em_andamento") && r.scheduledAt >= nowIso)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const next = upcoming[0];
  if (!next) return null;

  const appointment = await toView(next);
  const { history } = await buildClientSignals(next.customerId);

  return {
    appointment,
    lastVisitAt: history?.lastVisitAt ?? null,
    lastServiceNames: history?.lastServices ?? [],
    lastDiagnosticIssues: history?.lastDiagnosticIssues ?? [],
    pendingRecommendations: (history?.pendingRecommendations ?? []).map((r) => ({ category: r.category, observations: r.observations })),
  };
}

export async function searchPlanningAppointments(query: string): Promise<AppointmentView[]> {
  const repo = getPlanningRepository();
  const todayIso = saoPauloDateISO();
  const rows = await repo.searchAppointments(query, todayIso);
  return Promise.all(rows.map(toView));
}

/** `runner` opcional (Missão de Atomicidade Planejamento) — ver `registerQuickCustomerAndVehicle`. Omitido, comportamento idêntico a antes desta missão. */
export async function createAppointment(input: CreateAppointmentInput, runner?: DbOrTx): Promise<Appointment> {
  return getPlanningRepository().createAppointment(input, runner);
}

export interface CreateAppointmentAtomicInput {
  register: QuickRegisterInput;
  serviceId: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  notes?: string | null;
}

export interface CreateAppointmentAtomicResult {
  customer: Customer;
  vehicle: Vehicle;
  appointment: Appointment;
  possibleDuplicateCustomers: Customer[];
  possibleDuplicateVehicles: Vehicle[];
}

/** Lançado quando `checkAvailabilityForRequest` não retorna "available" — nada é escrito nesse caso (a transação nem chega a abrir). */
export class AppointmentAvailabilityError extends Error {
  constructor(public readonly availability: AvailabilityCheckResult) {
    super("Horário indisponível para criar o agendamento.");
    this.name = "AppointmentAvailabilityError";
  }
}

/**
 * Missão de Atomicidade Planejamento — versão atômica de "cliente novo/reaproveitado + veículo
 * novo/reaproveitado + agendamento" numa ÚNICA transação (`db.transaction()`). Se qualquer INSERT
 * falhar, TUDO que essa chamada escreveu é desfeito automaticamente pelo driver — nunca fica um
 * customer ou vehicle "órfão" sem o appointment correspondente. Registros REAPROVEITADOS (cliente/
 * veículo já existentes, encontrados por `SELECT`) nunca são afetados por rollback, porque nunca
 * foram escritos por esta transação.
 *
 * Reaproveita 100% da lógica já existente e testada (`registerQuickCustomerAndVehicle` —
 * normalização, dedupe por telefone/placa, avisos de possível duplicidade; `createAppointment`;
 * `checkAvailabilityForRequest` — checagem de disponibilidade, semântica inalterada por esta
 * missão) — nada foi duplicado aqui, só o `tx` passa a ser repassado explicitamente.
 *
 * A checagem de disponibilidade roda ANTES de abrir a transação: se o horário não estiver livre,
 * nada é escrito (nem a transação chega a ser aberta). Isso NÃO resolve a corrida entre duas
 * requisições verdadeiramente simultâneas (ambas podem checar "disponível" antes de qualquer uma
 * escrever) — esse problema é tratado à parte, deliberadamente fora do escopo desta missão.
 */
export async function createAppointmentWithNewCustomerAtomic(input: CreateAppointmentAtomicInput): Promise<CreateAppointmentAtomicResult> {
  const availability = await checkAvailabilityForRequest({
    serviceId: input.serviceId,
    scheduledAt: input.scheduledAt,
    expectedDurationMinutes: input.expectedDurationMinutes,
  });
  if (availability.status !== "available") {
    throw new AppointmentAvailabilityError(availability);
  }

  const db = getDb();
  if (!db) {
    throw new Error("createAppointmentWithNewCustomerAtomic exige DATABASE_URL configurada — sem transação real, não há atomicidade a garantir.");
  }

  return db.transaction(async (tx) => {
    const { customer, vehicle, possibleDuplicateCustomers, possibleDuplicateVehicles } = await registerQuickCustomerAndVehicle(input.register, tx);
    const appointment = await createAppointment(
      {
        customerId: customer.id,
        vehicleId: vehicle.id,
        serviceId: input.serviceId,
        scheduledAt: input.scheduledAt,
        expectedDurationMinutes: input.expectedDurationMinutes,
        notes: input.notes ?? null,
      },
      tx,
    );
    return { customer, vehicle, appointment, possibleDuplicateCustomers, possibleDuplicateVehicles };
  });
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
  return getPlanningRepository().updateAppointmentStatus(id, status);
}

export async function fetchActiveCapacityConfig(): Promise<CapacityConfig | null> {
  return getPlanningRepository().getActiveCapacityConfig();
}

export async function setCapacityConfig(input: SetCapacityConfigInput): Promise<CapacityConfig> {
  if (input.boxesCount <= 0 || input.dailyOperatingMinutes <= 0) {
    throw new Error("Boxes disponíveis e minutos de expediente devem ser maiores que zero.");
  }
  return getPlanningRepository().setCapacityConfig(input);
}

/**
 * Missão 3.1 (Fase 3 — Motor de Disponibilidade e Conflito) — checagem estrutural de sobreposição
 * de horário para um candidato de agendamento. SOMENTE LEITURA: nunca cria, altera ou cancela
 * nenhum `appointment` — é a camada que uma futura tool/ação de criação deveria consultar antes
 * de escrever, mas essa escrita não está autorizada nesta missão.
 *
 * Considera só agendamentos do MESMO DIA (calendário de São Paulo) cujo status ocupe capacidade
 * (`OCCUPYING_STATUSES` — cancelado/reagendado nunca bloqueiam horário). Duração é sempre a
 * informada explicitamente ou, na ausência dela, `services.estimatedDurationMinutes` — nunca uma
 * média inventada. Capacidade é sempre `operational_capacity_config` ativa — nunca assumida como
 * 1 box quando não configurada.
 */
export async function checkAvailabilityForRequest(request: AvailabilityRequest): Promise<AvailabilityCheckResult> {
  const repo = getPlanningRepository();
  const dateIso = saoPauloDateISO(new Date(request.scheduledAt));

  const rows = await repo.listAppointmentsInRange(dateIso, dateIso);
  const occupyingRows = rows.filter((r) => OCCUPYING_STATUSES.includes(r.status) && r.id !== request.excludeAppointmentId);

  const serviceIdsNeedingFallback = new Set<string>();
  if (request.expectedDurationMinutes == null) serviceIdsNeedingFallback.add(request.serviceId);
  for (const row of occupyingRows) {
    if (row.expectedDurationMinutes === null) serviceIdsNeedingFallback.add(row.serviceId);
  }

  const [config, durationFallbacks] = await Promise.all([
    repo.getActiveCapacityConfig(),
    serviceIdsNeedingFallback.size > 0 ? repo.getServiceEstimatedDurations(Array.from(serviceIdsNeedingFallback)) : Promise.resolve({} as Record<string, number | null>),
  ]);

  const candidateDuration = resolveCandidateDuration(request.expectedDurationMinutes ?? null, durationFallbacks[request.serviceId] ?? null);

  const sameDayOccupying: OccupyingAppointmentForCheck[] = occupyingRows.map((row) => ({
    id: row.id,
    scheduledAt: row.scheduledAt,
    durationMinutes: resolveCandidateDuration(row.expectedDurationMinutes, durationFallbacks[row.serviceId] ?? null),
  }));

  return checkAvailability({ scheduledAt: request.scheduledAt, durationMinutes: candidateDuration }, sameDayOccupying, config ? { boxesCount: config.boxesCount } : null);
}

export { fetchPackageServiceNames };
