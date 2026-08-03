import type { AppointmentView, CapacityConfig, CapacitySummary, Forecast, ForecastEntry, TomorrowPreparation } from "@/lib/planning/types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `null`/`config` ausente → `{ configured: false }`, nunca uma capacidade padrão inventada. */
export function computeCapacitySummary(config: CapacityConfig | null, occupyingAppointments: { expectedDurationMinutes: number | null }[]): CapacitySummary {
  if (!config) return { configured: false };

  const dailyCapacityMinutes = config.boxesCount * config.dailyOperatingMinutes;
  const withDuration = occupyingAppointments.filter((a) => a.expectedDurationMinutes !== null);
  const committedMinutes = withDuration.reduce((sum, a) => sum + (a.expectedDurationMinutes as number), 0);

  return {
    configured: true,
    boxesCount: config.boxesCount,
    dailyOperatingMinutes: config.dailyOperatingMinutes,
    dailyCapacityMinutes,
    committedMinutes,
    availableMinutes: dailyCapacityMinutes - committedMinutes,
    percentOccupied: dailyCapacityMinutes > 0 ? round2((committedMinutes / dailyCapacityMinutes) * 100) : 0,
    estimatedBoxesOccupied: config.dailyOperatingMinutes > 0 ? round2(committedMinutes / config.dailyOperatingMinutes) : 0,
    appointmentsMissingDuration: occupyingAppointments.length - withDuration.length,
  };
}

export interface CompletedOrderSample {
  serviceNames: string[];
  visitCreatedAt: string;
  updatedAt: string;
}

export interface ServiceDurationStat {
  averageMinutes: number;
  sampleSize: number;
}

/**
 * Duração média real por nome de serviço — só considera ordens com exatamente 1 serviço aprovado
 * (evita ambiguidade sobre qual serviço consumiu o tempo). Baseado no mesmo cálculo real de
 * `averageServiceDurationMinutes` (src/lib/attendance/home.ts): `updatedAt - visitCreatedAt`.
 */
export function computeAverageDurationByServiceName(orders: CompletedOrderSample[]): Record<string, ServiceDurationStat> {
  const bucket = new Map<string, number[]>();
  for (const order of orders) {
    if (order.serviceNames.length !== 1) continue;
    const minutes = (Date.parse(order.updatedAt) - Date.parse(order.visitCreatedAt)) / 60_000;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const name = order.serviceNames[0];
    const list = bucket.get(name) ?? [];
    list.push(minutes);
    bucket.set(name, list);
  }
  const result: Record<string, ServiceDurationStat> = {};
  for (const [name, minutesList] of bucket) {
    result[name] = { averageMinutes: Math.round(minutesList.reduce((sum, m) => sum + m, 0) / minutesList.length), sampleSize: minutesList.length };
  }
  return result;
}

/** Amostra mínima para confiar na média real de duração — decisão desta sprint, documentada (mesmo padrão de outros limiares do projeto). */
export const MIN_DURATION_SAMPLE_SIZE = 3;

/**
 * "Ainda cabe: 1 Gold ou 2 Bronze" — só entra na lista quando há capacidade configurada E amostra
 * histórica real suficiente para aquele serviço. Sem nenhuma das duas, `{ calculable: false }`.
 */
export function computeForecast(capacity: CapacitySummary, durationByServiceName: Record<string, ServiceDurationStat>, packageServiceNames: readonly string[]): Forecast {
  if (!capacity.configured) return { calculable: false };

  const entries: ForecastEntry[] = [];
  for (const name of packageServiceNames) {
    const stat = durationByServiceName[name];
    if (!stat || stat.sampleSize < MIN_DURATION_SAMPLE_SIZE || stat.averageMinutes <= 0) continue;
    entries.push({ serviceName: name, canFit: Math.max(0, Math.floor(capacity.availableMinutes / stat.averageMinutes)) });
  }
  return entries.length > 0 ? { calculable: true, entries } : { calculable: false };
}

export function computeTomorrowPreparation(occupyingAppointments: AppointmentView[], capacity: CapacitySummary, forecast: Forecast): TomorrowPreparation {
  const withDuration = occupyingAppointments.filter((a) => a.expectedDurationMinutes !== null);
  const totalPredictedMinutes = withDuration.reduce((sum, a) => sum + (a.expectedDurationMinutes as number), 0);
  return {
    vehicleCount: occupyingAppointments.length,
    serviceCount: occupyingAppointments.length,
    totalPredictedMinutes,
    appointmentsMissingDuration: occupyingAppointments.length - withDuration.length,
    capacity,
    forecast,
  };
}
