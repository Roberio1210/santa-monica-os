/**
 * Missão Z2 — observabilidade do Zézinho generativo. Mesmo padrão de
 * `integrations/jumppark/logger.ts`/`integrations/stone/logger.ts`: log estruturado (JSON),
 * nunca token/API key/segredo. Decisão de privacidade explícita (seção "Observabilidade" da
 * missão): NUNCA grava o texto integral da pergunta/resposta — só comprimento e um hash curto,
 * suficiente para depurar sem armazenar conteúdo de conversa.
 */

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "zezinho-generative", level, message, ...meta, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Hash curto e não-reversível só para correlacionar logs da mesma pergunta — nunca o texto em si. */
function shortHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export interface GenerativeInteractionLog {
  role: string;
  model: string;
  questionLength: number;
  questionHash: string;
  toolsCalled: string[];
  stepCount: number;
  durationMs: number;
  outcome: "ok" | "provider_error" | "fallback";
  groundedInRealSource: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Só o nome da classe do erro (ex.: "GatewayAuthenticationError") — nunca a mensagem completa do provider, para nunca arriscar um fragmento de credencial em log. */
  errorName: string | null;
}

export function logGenerativeInteraction(input: {
  role: string;
  model: string;
  question: string;
  toolsCalled: string[];
  stepCount: number;
  durationMs: number;
  outcome: GenerativeInteractionLog["outcome"];
  groundedInRealSource: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorName?: string | null;
}) {
  const entry: GenerativeInteractionLog = {
    role: input.role,
    model: input.model,
    questionLength: input.question.length,
    questionHash: shortHash(input.question),
    toolsCalled: input.toolsCalled,
    stepCount: input.stepCount,
    durationMs: input.durationMs,
    outcome: input.outcome,
    groundedInRealSource: input.groundedInRealSource,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    errorName: input.errorName ?? null,
  };
  emit(input.outcome === "provider_error" ? "warn" : "info", "Interação Zézinho generativo", entry as unknown as Record<string, unknown>);
}
