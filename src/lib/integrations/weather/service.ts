import "server-only";
import { fetchRawForecast, WeatherNotConfiguredError, type RawForecastSlot } from "@/lib/integrations/weather/client";
import { saoPauloDateISO, addDaysIso } from "@/lib/utils/timezone";
import type { DayForecastSummary, WeatherForecastResult } from "@/lib/integrations/weather/types";

/** Limiar de probabilidade de chuva (0-1) acima do qual consideramos "vai chover" no dia — decisão documentada, ajustável. */
const RAIN_PROBABILITY_THRESHOLD = 0.4;

export function summarizeDay(dateIso: string, slots: RawForecastSlot[]): DayForecastSummary | null {
  if (slots.length === 0) return null;

  const minTemp = Math.round(Math.min(...slots.map((s) => s.main.temp_min)) * 10) / 10;
  const maxTemp = Math.round(Math.max(...slots.map((s) => s.main.temp_max)) * 10) / 10;
  const maxPrecipitationProbability = Math.round(Math.max(...slots.map((s) => s.pop)) * 100) / 100;
  const windSpeedMaxKmh = Math.round(Math.max(...slots.map((s) => s.wind.speed)) * 3.6);

  const descriptionCounts = new Map<string, number>();
  for (const s of slots) {
    const desc = s.weather[0]?.description ?? "";
    if (!desc) continue;
    descriptionCounts.set(desc, (descriptionCounts.get(desc) ?? 0) + 1);
  }
  const dominantCondition = Array.from(descriptionCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "sem dado";

  return { dateIso, minTemp, maxTemp, maxPrecipitationProbability, willRain: maxPrecipitationProbability >= RAIN_PROBABILITY_THRESHOLD, dominantCondition, windSpeedMaxKmh };
}

/**
 * Previsão do tempo para hoje e amanhã (São Paulo timezone) — nunca lança: sem chave
 * configurada ou falha de rede, devolve `{configured: false, error: "..."}"` honestamente,
 * mesmo padrão de `fetchOperationalOrders` (JumpPark) e `getAiProviderConfig`.
 */
export async function fetchWeatherForecast(referenceDate: Date = new Date()): Promise<WeatherForecastResult> {
  const todayIso = saoPauloDateISO(referenceDate);
  const tomorrowIso = addDaysIso(todayIso, 1);

  try {
    const raw = await fetchRawForecast();
    const slotsByDate = new Map<string, RawForecastSlot[]>();
    for (const slot of raw.list) {
      const dateIso = saoPauloDateISO(new Date(`${slot.dt_txt.replace(" ", "T")}Z`));
      const bucket = slotsByDate.get(dateIso) ?? [];
      bucket.push(slot);
      slotsByDate.set(dateIso, bucket);
    }

    return {
      configured: true,
      error: null,
      location: `${raw.city.name}, ${raw.city.country}`,
      today: summarizeDay(todayIso, slotsByDate.get(todayIso) ?? []),
      tomorrow: summarizeDay(tomorrowIso, slotsByDate.get(tomorrowIso) ?? []),
    };
  } catch (error) {
    if (error instanceof WeatherNotConfiguredError) {
      return { configured: false, error: "Previsão do tempo não configurada neste ambiente.", location: null, today: null, tomorrow: null };
    }
    return { configured: true, error: "Não foi possível consultar a previsão do tempo.", location: null, today: null, tomorrow: null };
  }
}
