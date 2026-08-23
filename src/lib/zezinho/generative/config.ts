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

/**
 * Missão Z3.4 — auditoria end-to-end encontrou o painel "Sobre o Zézinho" (`/zezinho`) lendo o
 * status de `ai-provider.ts` (módulo de uma sprint anterior à Z2, que lê `ZEZINHO_AI_ENABLED`/
 * `ZEZINHO_AI_API_KEY` — nunca configurados em produção, porque o Gateway real usa o token OIDC
 * injetado automaticamente pela Vercel, não uma API key) em vez de `ZEZINHO_GENERATIVE_ENABLED`
 * (a flag que `answerGenerative`/`orchestrator.ts` realmente usam). Resultado: o painel dizia
 * "Analítico local" mesmo com o modo generativo real ativo e respondendo. Esta função lê a
 * MESMA config que o orquestrador usa — nunca uma fonte paralela — para que o rótulo exibido não
 * possa divergir de novo do pipeline real. Extraída como função pura (não direto em `page.tsx`)
 * para ser testável sem harness de Server Component.
 */
export function describeGenerativeMode(config: GenerativeConfig = getGenerativeConfig()): { badgeLabel: string; description: string } {
  if (!config.enabled) {
    return {
      badgeLabel: "Analítico local",
      description: "Hoje respondo no modo analítico local — direto, natural e baseado 100% em dados reais, sem depender de um provedor de IA externo.",
    };
  }
  return {
    badgeLabel: `IA generativa (${config.model})`,
    description: `Uso IA generativa (${config.model}, via Vercel AI Gateway) como mecanismo principal: interpreto sua pergunta, escolho as ferramentas liberadas pelo seu perfil e busco os dados reais antes de responder. Se o provedor de IA ficar indisponível num momento específico, caio automaticamente no modo analítico local como fallback de segurança — nunca deixo de responder.`,
  };
}
