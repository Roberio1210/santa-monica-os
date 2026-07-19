/**
 * Camada abstrata de provedor de IA (seção 3 da sprint) — nunca acopla o sistema a uma empresa
 * específica, e nunca assume que uma assinatura de produto (Claude, ChatGPT etc.) inclui acesso
 * de API. Sem nenhuma chave configurada, o sistema roda inteiramente no modo analítico local
 * (ver service.ts:answerFreeText) — este módulo só expõe a config para exibição em
 * /configuracoes/status. Nenhum SDK de IA é chamado nesta sprint.
 */

export type AiProviderName = "disabled" | "openai" | "anthropic" | "google" | "vercel_ai_gateway";

const VALID_PROVIDERS: AiProviderName[] = ["disabled", "openai", "anthropic", "google", "vercel_ai_gateway"];

export interface AiProviderConfig {
  provider: AiProviderName;
  /** Nome do modelo configurado — nunca revela segredo, é só um identificador (ex.: "gpt-4o"). */
  model: string | null;
  enabled: boolean;
  hasApiKey: boolean;
}

/**
 * Lê a configuração do provedor de IA a partir do ambiente. Nunca lança e nunca expõe o valor
 * da chave — só se ela está presente ou não. Ausência ou valor desconhecido em
 * ZEZINHO_AI_PROVIDER sempre cai em "disabled" (nunca assume um provedor por padrão).
 */
export function getAiProviderConfig(): AiProviderConfig {
  const rawProvider = process.env.ZEZINHO_AI_PROVIDER;
  const provider: AiProviderName = rawProvider && (VALID_PROVIDERS as string[]).includes(rawProvider) ? (rawProvider as AiProviderName) : "disabled";
  const explicitlyEnabled = process.env.ZEZINHO_AI_ENABLED === "true";
  const hasApiKey = !!process.env.ZEZINHO_AI_API_KEY && process.env.ZEZINHO_AI_API_KEY.length > 0;
  const model = process.env.ZEZINHO_AI_MODEL || null;

  return {
    provider,
    model,
    enabled: provider !== "disabled" && explicitlyEnabled && hasApiKey,
    hasApiKey,
  };
}

export function isAiProviderConfigured(): boolean {
  return getAiProviderConfig().enabled;
}

/**
 * Interface que um provedor real implementaria no futuro (generateResponse/streamResponse/
 * classifyIntent/createQueryPlan) — nunca instanciada nesta sprint, só documenta o contrato para
 * quando um provedor real for conectado. O modo local (answerFreeText) não depende disto.
 */
export interface AiProvider {
  generateResponse(prompt: string, context: Record<string, unknown>): Promise<string>;
  streamResponse(prompt: string, context: Record<string, unknown>): AsyncIterable<string>;
  classifyIntent(freeText: string): Promise<{ intent: string; confidence: number }>;
  createQueryPlan(freeText: string): Promise<{ tools: string[] }>;
}
