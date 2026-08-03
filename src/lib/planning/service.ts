import "server-only";
import { fetchCustomerSearchResult } from "@/lib/attendance/service";
import type { CustomerHistorySummary } from "@/lib/attendance/types";
import { computeAverageDurationByServiceName, computeCapacitySummary, computeForecast, computeTomorrowPreparation } from "@/lib/planning/capacity";
import { deriveClientSignals } from "@/lib/planning/clientSignals";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import type { AppointmentRow } from "@/lib/planning/repository";
import {
  OCCUPYING_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentView,
  type CapacityConfig,
  type ClientSignal,
  type CreateAppointmentInput,
  type NextClientCard,
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

async function fetchTomorrowPreparation(): Promise<PlanningBoard["tomorrowPreparation"]> {
  const repo = getPlanningRepository();
  const todayIso = saoPauloDateISO();
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [rows, config, completedOrders, packageNames] = await Promise.all([
    repo.listAppointmentsInRange(tomorrowIso, tomorrowIso),
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

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  return getPlanningRepository().createAppointment(input);
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

export { fetchPackageServiceNames };
