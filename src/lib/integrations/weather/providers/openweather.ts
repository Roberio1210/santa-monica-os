import "server-only";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { CurrentConditions, DailyForecastSummary, HourlyForecastPoint, WeatherProvider } from "@/lib/integrations/weather/types";

/**
 * Provedor OpenWeatherMap — escolhido no lugar do WindGuru preferido inicialmente: WindGuru não
 * tem API REST pública documentada para consumo de terceiros (orientado a widget/iframe e upload
 * de estação pessoal, não a integração server-side). Usa dois endpoints gratuitos, sem
 * assinatura paga: "Current Weather" (condição agora) e "5 day / 3 hour Forecast" (previsão).
 *
 * Implementa `WeatherProvider` — para trocar de provedor no futuro, basta escrever uma nova
 * classe implementando o mesmo contrato e trocar a instância em `service.ts`; nada mais no
 * sistema precisa mudar.
 */

const CURRENT_URL = "https://api.openweathermap.org/data/2.5/weather";
const FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast";
const HTTP_TIMEOUT_MS = 8_000;
/** Quantos passos de 3h entram em "próximas horas" — 8 passos = 24h. */
const NEXT_HOURS_STEPS = 8;

export class WeatherRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WeatherRequestError";
    this.status = status;
  }
}

interface RawCurrentResponse {
  main: { temp: number; feels_like: number };
  weather: { description: string }[];
  wind: { speed: number };
}

interface RawForecastSlot {
  dt_txt: string; // "YYYY-MM-DD HH:mm:ss", UTC
  main: { temp: number; feels_like: number; temp_min: number; temp_max: number };
  weather: { description: string }[];
  pop: number; // 0-1
  wind: { speed: number }; // m/s
  rain?: { "3h"?: number };
}

interface RawForecastResponse {
  list: RawForecastSlot[];
}

function msToKmh(metersPerSecond: number): number {
  return Math.round(metersPerSecond * 3.6);
}

async function requestJson<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new WeatherRequestError(response.status, body.slice(0, 200));
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(base: string, location: string, apiKey: string): URL {
  const url = new URL(base);
  url.searchParams.set("q", location);
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "pt_br");
  return url;
}

function summarizeDailyForecast(slots: RawForecastSlot[]): DailyForecastSummary[] {
  const byDate = new Map<string, RawForecastSlot[]>();
  for (const slot of slots) {
    const dateIso = saoPauloDateISO(new Date(`${slot.dt_txt.replace(" ", "T")}Z`));
    const bucket = byDate.get(dateIso) ?? [];
    bucket.push(slot);
    byDate.set(dateIso, bucket);
  }

  const RAIN_PROBABILITY_THRESHOLD = 0.4;
  const summaries: DailyForecastSummary[] = [];
  for (const [dateIso, daySlots] of Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const minTemp = Math.round(Math.min(...daySlots.map((s) => s.main.temp_min)) * 10) / 10;
    const maxTemp = Math.round(Math.max(...daySlots.map((s) => s.main.temp_max)) * 10) / 10;
    const maxPrecipitationProbability = Math.round(Math.max(...daySlots.map((s) => s.pop)) * 100) / 100;
    const totalRainVolumeMm = daySlots.some((s) => s.rain?.["3h"] !== undefined) ? Math.round(daySlots.reduce((sum, s) => sum + (s.rain?.["3h"] ?? 0), 0) * 10) / 10 : null;
    const windSpeedMaxKmh = Math.max(...daySlots.map((s) => msToKmh(s.wind.speed)));

    const descriptionCounts = new Map<string, number>();
    for (const s of daySlots) {
      const desc = s.weather[0]?.description ?? "";
      if (desc) descriptionCounts.set(desc, (descriptionCounts.get(desc) ?? 0) + 1);
    }
    const dominantCondition = Array.from(descriptionCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "sem dado";

    summaries.push({ dateIso, minTemp, maxTemp, maxPrecipitationProbability, totalRainVolumeMm, willRain: maxPrecipitationProbability >= RAIN_PROBABILITY_THRESHOLD, dominantCondition, windSpeedMaxKmh });
  }
  return summaries;
}

export class OpenWeatherProvider implements WeatherProvider {
  readonly name = "OpenWeatherMap";

  constructor(private readonly apiKey: string) {}

  async fetchCurrent(location: string): Promise<CurrentConditions> {
    const raw = await requestJson<RawCurrentResponse>(buildUrl(CURRENT_URL, location, this.apiKey));
    return {
      temperature: Math.round(raw.main.temp * 10) / 10,
      feelsLike: Math.round(raw.main.feels_like * 10) / 10,
      condition: raw.weather[0]?.description ?? "sem dado",
      // A API de condição atual não expõe probabilidade de chuva (isso só existe na previsão) — nunca inventamos um valor aqui.
      precipitationProbability: null,
      windSpeedKmh: msToKmh(raw.wind.speed),
    };
  }

  async fetchForecast(location: string): Promise<{ nextHours: HourlyForecastPoint[]; dailyForecast: DailyForecastSummary[] }> {
    const raw = await requestJson<RawForecastResponse>(buildUrl(FORECAST_URL, location, this.apiKey));

    const nextHours: HourlyForecastPoint[] = raw.list.slice(0, NEXT_HOURS_STEPS).map((slot) => ({
      time: new Date(`${slot.dt_txt.replace(" ", "T")}Z`).toISOString(),
      temperature: Math.round(slot.main.temp * 10) / 10,
      precipitationProbability: Math.round(slot.pop * 100) / 100,
      rainVolumeMm: slot.rain?.["3h"] !== undefined ? Math.round(slot.rain["3h"] * 10) / 10 : null,
      windSpeedKmh: msToKmh(slot.wind.speed),
      condition: slot.weather[0]?.description ?? "sem dado",
    }));

    return { nextHours, dailyForecast: summarizeDailyForecast(raw.list) };
  }
}
