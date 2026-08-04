import "server-only";
import { pingDatabase, type DatabasePing } from "@/db/client";
import { fetchJumpParkDiagnostics, type JumpParkDiagnostics } from "@/lib/integrations/jumppark";
import packageJson from "../../../package.json";

/**
 * Painel de Diagnóstico (Missão de estabilização, 04/08/2026) — agrega o estado real das
 * integrações críticas (Neon, JumpPark) numa única verificação, sempre ao vivo, nunca cacheada.
 * Nunca expõe segredo nenhum (token, connection string) — só booleanos, latência e mensagens já
 * sanitizadas pelas próprias camadas de diagnóstico (`db/client.ts`, `jumppark/diagnostics.ts`).
 */

export interface AdminDiagnosticsSnapshot {
  checkedAt: string;
  database: DatabasePing;
  jumpPark: JumpParkDiagnostics;
  version: string;
  commitSha: string | null;
  environment: string;
}

export async function fetchAdminDiagnostics(): Promise<AdminDiagnosticsSnapshot> {
  const [database, jumpPark] = await Promise.all([pingDatabase(), fetchJumpParkDiagnostics()]);

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const environment = process.env.VERCEL_ENV ?? "development";

  return {
    checkedAt: new Date().toISOString(),
    database,
    jumpPark,
    version: packageJson.version,
    commitSha,
    environment,
  };
}
