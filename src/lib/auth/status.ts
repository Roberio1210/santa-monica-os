import "server-only";

export interface AuthStatus {
  /** Gate temporário de Basic Auth (middleware.ts), independente de banco. */
  temporaryGateEnabled: boolean;
  /**
   * Autenticação completa (sessão, papéis, tela de login funcional). Depende de banco
   * configurado E de implementação adicional (hash de senha, sessão) que ainda não existe —
   * por isso é sempre `false` nesta versão, mesmo com banco conectado. Ver
   * docs/database-and-auth-setup-guide.md, seção "Como ativar autenticação".
   */
  fullAuthConfigured: boolean;
  /** Verdadeiro quando o app está publicamente acessível sem nenhuma proteção. */
  publiclyAccessible: boolean;
}

export function getAuthStatus(): AuthStatus {
  const temporaryGateEnabled = process.env.APP_ACCESS_ENABLED === "true";
  const fullAuthConfigured = false;
  return {
    temporaryGateEnabled,
    fullAuthConfigured,
    publiclyAccessible: !temporaryGateEnabled && !fullAuthConfigured,
  };
}
