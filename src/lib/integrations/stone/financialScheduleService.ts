import "server-only";
import { isStoneConfigured } from "@/lib/config/env";
import { DEFAULT_LOOKBACK_DAYS, dataAvailableThroughDate, fetchNormalizedConciliations, lookbackDates, successfulNormalizedConciliations } from "@/lib/integrations/stone/multiDay";
import { buildFinancialSchedule, type FinancialSchedule } from "@/lib/integrations/stone/financialSchedule";
import type { StoneResultStatus } from "@/lib/integrations/stone/types";

/**
 * Único ponto de entrada público da Agenda Financeira (Sprint 7.0, Z3) — orquestra `multiDay.ts`
 * (I/O) + `financialSchedule.ts` (cálculo puro). Ninguém fora de `integrations/stone/` deve
 * montar essa janela de dias na mão — é isso que este serviço evita duplicar.
 */
export interface FinancialScheduleResult {
  status: StoneResultStatus;
  error: string | null;
  limitations: string[];
  schedule: FinancialSchedule | null;
}

export async function buildFinancialScheduleForToday(todayIso: string, lookbackDays: number = DEFAULT_LOOKBACK_DAYS): Promise<FinancialScheduleResult> {
  if (!isStoneConfigured()) {
    return { status: "not_configured", error: "Integração Stone não configurada neste ambiente.", limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes."], schedule: null };
  }

  const dates = lookbackDates(todayIso, lookbackDays);
  const dayResults = await fetchNormalizedConciliations(dates);
  const successfulDays = successfulNormalizedConciliations(dayResults);
  const availableThrough = dataAvailableThroughDate(dayResults);

  if (successfulDays.length === 0 || !availableThrough) {
    const statuses = new Set(dayResults.map((r) => r.status));
    const status: StoneResultStatus = statuses.size === 1 ? [...statuses][0] : "temporary_failure";
    return { status, error: "Nenhum arquivo de conciliação disponível na janela consultada.", limitations: ["Todos os dias da janela retornaram sem dado — arquivo ainda não publicado ou indisponível."], schedule: null };
  }

  const schedule = buildFinancialSchedule(successfulDays, todayIso, availableThrough);
  const failedDaysCount = dayResults.length - successfulDays.length;
  const limitations = [...schedule.limitations];
  if (failedDaysCount > 0) limitations.push(`${failedDaysCount} de ${dayResults.length} dia(s) da janela de ${lookbackDays} dias não puderam ser obtidos — a Agenda pode estar incompleta para esses dias.`);

  return { status: "ok", error: null, limitations, schedule };
}
