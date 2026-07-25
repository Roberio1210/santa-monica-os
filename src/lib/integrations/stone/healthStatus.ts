import "server-only";
import { isStoneConfigured } from "@/lib/config/env";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneImportRun } from "@/lib/integrations/stone/persistence/types";

/**
 * Status/saúde da integração Stone Conciliação (Sprint 7.0, Z4, decisão do usuário) — 11 valores.
 * Cada valor só é retornado quando há um sinal real que o distingue dos demais (nenhuma
 * inferência inventada). Duas distinções que a documentação real da Stone confirma existirem mas
 * que este checkpoint não consegue detectar com certeza absoluta a partir do texto de erro
 * genérico ("access_pending" vs. "auth_error" para 401 vs. 403) são derivadas por um sinal
 * honesto e real — histórico: nunca teve acesso (access_pending) vs. já teve e parou de ter
 * (auth_error) — documentado abaixo, nunca uma adivinhação de HTTP status não preservado.
 */
export type StoneIntegrationHealth =
  | "not_configured"
  | "credentials_pending"
  | "access_pending"
  | "connected"
  | "syncing"
  | "healthy"
  | "degraded"
  | "auth_error"
  | "temporary_failure"
  | "stale_data"
  | "no_data";

export interface StoneIntegrationHealthReport {
  health: StoneIntegrationHealth;
  configured: boolean;
  lastImportRun: StoneImportRun | null;
  lastSuccessfulImportRun: StoneImportRun | null;
  recentRuns: StoneImportRun[];
}

const RECENT_RUNS_WINDOW = 20;
/** Acima disso, mesmo com credencial válida, uma última liquidação real muito antiga vira `stale_data` — mesma tolerância de defasagem oficial usada em `jumpparkReconciliation.ts` (29h), com folga para o ciclo diário completo. */
const STALE_THRESHOLD_HOURS = 48;

function isPermissionFailure(run: StoneImportRun): boolean {
  return run.status === "failed" && run.failureStatus === "insufficient_permission";
}

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

/**
 * Deriva a saúde a partir do histórico real de `stone_import_runs` — nunca de uma suposição.
 * `recentRuns` deve vir ordenado do mais recente para o mais antigo (mesmo contrato de
 * `repo.listImportRuns`).
 */
export function computeIntegrationHealth(configured: boolean, recentRuns: StoneImportRun[], now: Date = new Date()): StoneIntegrationHealth {
  if (!configured) return "not_configured";
  if (recentRuns.length === 0) return "credentials_pending";
  if (recentRuns.some((r) => r.status === "running")) return "syncing";

  const latest = recentRuns[0];
  const everSucceededWithData = recentRuns.some((r) => r.status === "succeeded" && (r.recordCount ?? 0) > 0);

  if (isPermissionFailure(latest)) {
    // Já teve dado real antes e agora está sem permissão: a credencial foi revogada/alterada (erro real).
    // Nunca teve dado real: a credencial existe mas o acesso ao StoneCode ainda não foi liberado do lado Stone.
    return everSucceededWithData ? "auth_error" : "access_pending";
  }

  if (latest.status === "failed") return "temporary_failure";

  // A partir daqui, a última execução terminou com sucesso (ainda que com zero registros).
  if ((latest.recordCount ?? 0) > 0) {
    const anyRecentFailure = recentRuns.some((r) => r.status === "failed");
    return anyRecentFailure ? "degraded" : "healthy";
  }

  if (!everSucceededWithData) return "no_data";

  const lastDataRun = recentRuns.find((r) => r.status === "succeeded" && (r.recordCount ?? 0) > 0);
  const hoursSinceData = lastDataRun?.finishedAt ? hoursSince(lastDataRun.finishedAt, now) : Infinity;
  return hoursSinceData > STALE_THRESHOLD_HOURS ? "stale_data" : "connected";
}

/** Ponto de entrada público — busca o histórico real e deriva a saúde. Nunca lança. */
export async function getStoneIntegrationHealth(now: Date = new Date()): Promise<StoneIntegrationHealthReport> {
  const configured = isStoneConfigured();
  if (!configured) {
    return { health: "not_configured", configured, lastImportRun: null, lastSuccessfulImportRun: null, recentRuns: [] };
  }

  const repo = getStonePersistenceRepository();
  const [recentRuns, lastSuccessfulImportRun] = await Promise.all([repo.listImportRuns(RECENT_RUNS_WINDOW), repo.getLatestSucceededImportRun()]);

  return {
    health: computeIntegrationHealth(configured, recentRuns, now),
    configured,
    lastImportRun: recentRuns[0] ?? null,
    lastSuccessfulImportRun,
    recentRuns,
  };
}
