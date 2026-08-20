import "server-only";

export interface AuthStatus {
  /** Gate temporário de Basic Auth (middleware.ts), independente de banco. */
  temporaryGateEnabled: boolean;
  /**
   * Autenticação individual (sessão por usuário, papéis ADMIN/OPERACIONAL, login funcional —
   * Missão de Usuários Individuais V5.3). O código existe e funciona a partir desta missão, mas
   * só é EXIGIDO pelo middleware quando `INDIVIDUAL_AUTH_ENABLED=true` — ligado deliberadamente
   * depois de existir pelo menos um usuário ADMIN validado (ver middleware.ts).
   */
  fullAuthConfigured: boolean;
  /** Verdadeiro quando o app está publicamente acessível sem nenhuma proteção. */
  publiclyAccessible: boolean;
}

export function getAuthStatus(): AuthStatus {
  const temporaryGateEnabled = process.env.APP_ACCESS_ENABLED === "true";
  const fullAuthConfigured = process.env.INDIVIDUAL_AUTH_ENABLED === "true";
  return {
    temporaryGateEnabled,
    fullAuthConfigured,
    publiclyAccessible: !temporaryGateEnabled && !fullAuthConfigured,
  };
}
