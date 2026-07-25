import "server-only";
import { CATEGORY_MESSAGES } from "@/lib/integrations/stone/service";
import type { StoneFailureCategory } from "@/lib/integrations/stone/failureClassification";
import type { StoneImportRun } from "@/lib/integrations/stone/persistence/types";

/**
 * Status visual da última sincronização (Sprint 7.1, Etapa 5, decisão do usuário) — 5 estados
 * semânticos, calculados a partir do estado atual (`stone_import_runs`) do período sincronizado.
 * Independente de `healthStatus.ts` (11 valores, Z4, olha o histórico rolante da integração como um
 * todo) — este é o resumo de UMA sincronização (o conjunto de dias do período pedido), sempre
 * refletindo corretamente sucesso parcial (nunca "Falha temporária" quando a maioria teve sucesso).
 */
export type StoneSyncVisualStatus = "completed" | "completed_with_alerts" | "temporary_failure" | "action_required" | "awaiting_first_sync";

export const SYNC_STATUS_LABELS: Record<StoneSyncVisualStatus, string> = {
  completed: "Sincronização concluída",
  completed_with_alerts: "Sincronização concluída com alertas",
  temporary_failure: "Falha temporária",
  action_required: "Ação necessária",
  awaiting_first_sync: "Aguardando primeira sincronização",
};

/** Dias sem arquivo — nunca uma falha real, sempre um alerta esperado (publicação defasada ou dia sem movimentação). */
const ALERT_CATEGORIES: ReadonlySet<StoneFailureCategory> = new Set(["no_data_expected", "file_not_published_yet"]);
/** Credencial inválida ou sem permissão — nunca tratado como falha temporária, exige ação humana. */
const CREDENTIAL_CATEGORIES: ReadonlySet<StoneFailureCategory> = new Set(["authentication_failure", "insufficient_permission"]);

export interface StoneSyncStatusReport {
  status: StoneSyncVisualStatus;
  label: string;
  daysTotal: number;
  daysSucceeded: number;
  daysWithAlert: number;
  daysWithFailure: number;
  transactionsUpdated: number;
  lastRealDataDate: string | null;
  /** Motivo sanitizado (nunca segredo/URL completa) do alerta mais recente, se houver. */
  alertReason: string | null;
  /** Motivo sanitizado da falha mais recente, se houver. */
  failureReason: string | null;
  /** Datas com alerta ou falha — candidatas a reprocessamento individual pela UI. */
  reprocessableDates: string[];
}

function isCredentialFailure(run: StoneImportRun): boolean {
  return run.status === "failed" && run.failureCategory !== null && CREDENTIAL_CATEGORIES.has(run.failureCategory);
}

function isAlertDay(run: StoneImportRun): boolean {
  return run.status === "succeeded" && run.failureCategory !== null && ALERT_CATEGORIES.has(run.failureCategory);
}

function isRealFailure(run: StoneImportRun): boolean {
  return run.status === "failed" && !isCredentialFailure(run);
}

function mostRecentBy(runs: StoneImportRun[]): StoneImportRun | null {
  if (runs.length === 0) return null;
  return [...runs].sort((a, b) => b.referenceDate.localeCompare(a.referenceDate))[0];
}

/**
 * Deriva o status visual a partir do estado atual dos dias do período sincronizado — nunca do
 * histórico bruto de tentativas. `runs` deve conter uma linha por `referenceDate` (o próprio
 * modelo de persistência já garante isso via upsert idempotente). Nunca lança.
 */
export function computeSyncStatus(runs: StoneImportRun[]): StoneSyncStatusReport {
  if (runs.length === 0) {
    return {
      status: "awaiting_first_sync",
      label: SYNC_STATUS_LABELS.awaiting_first_sync,
      daysTotal: 0,
      daysSucceeded: 0,
      daysWithAlert: 0,
      daysWithFailure: 0,
      transactionsUpdated: 0,
      lastRealDataDate: null,
      alertReason: null,
      failureReason: null,
      reprocessableDates: [],
    };
  }

  const succeededRuns = runs.filter((r) => r.status === "succeeded" && r.failureCategory === null);
  const alertRuns = runs.filter(isAlertDay);
  const credentialRuns = runs.filter(isCredentialFailure);
  const otherFailedRuns = runs.filter(isRealFailure);

  const transactionsUpdated = succeededRuns.reduce((sum, r) => sum + (r.recordCount ?? 0), 0);
  const lastRealDataDate = succeededRuns.length > 0 ? succeededRuns.map((r) => r.referenceDate).sort().at(-1)! : null;
  const alertReason = alertRuns.length > 0 ? CATEGORY_MESSAGES[mostRecentBy(alertRuns)!.failureCategory!] : null;
  const failureReason = otherFailedRuns.length > 0 ? CATEGORY_MESSAGES[mostRecentBy(otherFailedRuns)!.failureCategory!] : credentialRuns.length > 0 ? CATEGORY_MESSAGES[mostRecentBy(credentialRuns)!.failureCategory!] : null;
  const reprocessableDates = [...alertRuns, ...credentialRuns, ...otherFailedRuns].map((r) => r.referenceDate).sort();

  const base = {
    daysTotal: runs.length,
    daysSucceeded: succeededRuns.length,
    daysWithAlert: alertRuns.length,
    daysWithFailure: credentialRuns.length + otherFailedRuns.length,
    transactionsUpdated,
    lastRealDataDate,
    alertReason,
    failureReason,
    reprocessableDates,
  };

  if (credentialRuns.length > 0) {
    return { status: "action_required", label: SYNC_STATUS_LABELS.action_required, ...base };
  }
  if (succeededRuns.length === 0 && otherFailedRuns.length > 0) {
    return { status: "temporary_failure", label: SYNC_STATUS_LABELS.temporary_failure, ...base };
  }
  if (otherFailedRuns.length === 0 && alertRuns.length === 0) {
    return { status: "completed", label: SYNC_STATUS_LABELS.completed, ...base };
  }
  return { status: "completed_with_alerts", label: SYNC_STATUS_LABELS.completed_with_alerts, ...base };
}
