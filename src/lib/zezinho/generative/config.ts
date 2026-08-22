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

/**
 * Missão Z2.1 — confirmado por chamada real ao Gateway (`gateway.getAvailableModels()` +
 * teste direto): o crédito gratuito de US$ 5 desta conta NÃO dá acesso a modelos Anthropic/
 * Google/Meta/DeepSeek (todos voltam "Free tier users do not have access to this model" ou
 * rate limit imediato) — `openai/gpt-oss-20b` foi o único testado que respondeu de verdade
 * dentro do tier gratuito. Trocar para um modelo pago exige decisão do gestor (custo), não
 * uma escolha unilateral aqui.
 */
const DEFAULT_MODEL = "openai/gpt-oss-20b";

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
