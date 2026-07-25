import "server-only";
import { getConciliationFile } from "@/lib/integrations/stone/service";
import { normalizeConciliation, type NormalizedConciliation } from "@/lib/integrations/stone/normalize";
import { addDaysIso } from "@/lib/utils/timezone";
import type { StoneResultStatus } from "@/lib/integrations/stone/types";
import type { StoneFailureDiagnostics } from "@/lib/integrations/stone/failureClassification";

/**
 * Orquestrador fino de I/O multi-dia (Sprint 7.0, Z3) — reaproveita `service.ts` (Z1,
 * `getConciliationFile`, já com cache/timeout/status) e `normalize.ts` (Z2) sem duplicar nenhuma
 * lógica de busca ou parsing. Único ponto compartilhado pela Agenda Financeira e pela Conciliação
 * Stone×JumpPark para obter vários dias de uma vez — nenhuma das duas reimplementa isto.
 *
 * Cada data é uma combinação de rate limit independente na Stone (7 req/hora por
 * StoneCode+data — seção 1.2 do documento de arquitetura), então buscar N dias distintos numa
 * mesma chamada nunca esbarra nesse limite; o cache de `service.ts` já evita rebuscar uma data já
 * processada nesta mesma instância do processo.
 */

export interface DayFetchResult {
  referenceDate: string;
  status: StoneResultStatus;
  normalized: NormalizedConciliation | null;
  error: string | null;
  limitations: string[];
  /** Diagnóstico estruturado da falha (Sprint 7.1) — `null` quando `status === "ok"`. */
  failureDiagnostics: StoneFailureDiagnostics | null;
}

export const DEFAULT_LOOKBACK_DAYS = 30;

/** As `days` datas (`YYYY-MM-DD`) anteriores a `referenceDate`, inclusive, em ordem crescente — nunca uma data futura. */
export function lookbackDates(referenceDate: string, days: number = DEFAULT_LOOKBACK_DAYS): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDaysIso(referenceDate, -i));
  return dates;
}

/** Busca e normaliza várias datas em paralelo. Nunca lança — cada data devolve seu próprio status honesto, uma falha isolada nunca derruba as demais. */
export async function fetchNormalizedConciliations(referenceDates: string[]): Promise<DayFetchResult[]> {
  return Promise.all(
    referenceDates.map(async (referenceDate): Promise<DayFetchResult> => {
      const result = await getConciliationFile(referenceDate);
      if (result.status !== "ok" || !result.file) {
        return { referenceDate, status: result.status, normalized: null, error: result.error, limitations: result.limitations, failureDiagnostics: result.failureDiagnostics };
      }
      return { referenceDate, status: "ok", normalized: normalizeConciliation(result.file), error: null, limitations: result.limitations, failureDiagnostics: null };
    }),
  );
}

/** Só os dias com dado real — `no_data` (arquivo ainda não publicado, ex.: hoje) é o caso mais comum e esperado, nunca um erro. */
export function successfulNormalizedConciliations(results: DayFetchResult[]): NormalizedConciliation[] {
  return results.filter((r): r is DayFetchResult & { normalized: NormalizedConciliation } => r.normalized !== null).map((r) => r.normalized);
}

/**
 * Última data com visibilidade real de liquidação — o mais recente dia que devolveu `status:
 * "ok"`. `null` quando nenhum dia teve sucesso (nunca assume "hoje" nesse caso).
 */
export function dataAvailableThroughDate(results: DayFetchResult[]): string | null {
  const okDates = results.filter((r) => r.status === "ok").map((r) => r.referenceDate);
  if (okDates.length === 0) return null;
  return okDates.sort().at(-1)!;
}
