import "server-only";

/**
 * Missão Z2 — configuração do Zézinho generativo. Feature flag desligada por padrão (mesmo
 * padrão já usado em `INDIVIDUAL_AUTH_ENABLED`/`APP_ACCESS_ENABLED`): implantar o código com
 * segurança, sem mudar o comportamento em produção até ativação explícita.
 *
 * A credencial em si (`AI_GATEWAY_API_KEY`, ou o token OIDC injetado automaticamente pela Vercel
 * em runtime) NUNCA é lida aqui — o SDK (`ai`/Vercel AI Gateway) resolve isso sozinho a partir do
 * ambiente. Este módulo só decide SE o modo generativo deve ser tentado, e com qual modelo.
 */

const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";

export interface GenerativeConfig {
  enabled: boolean;
  model: string;
}

export function getGenerativeConfig(): GenerativeConfig {
  return {
    enabled: process.env.ZEZINHO_GENERATIVE_ENABLED === "true",
    model: process.env.ZEZINHO_AI_MODEL || DEFAULT_MODEL,
  };
}

export function isGenerativeEnabled(): boolean {
  return getGenerativeConfig().enabled;
}
