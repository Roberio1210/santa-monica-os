import "server-only";
import { generateText, stepCountIs } from "ai";
import type { UserRole } from "@/lib/auth/roles";
import { getGenerativeConfig } from "@/lib/zezinho/generative/config";
import { buildZezinhoTools } from "@/lib/zezinho/generative/tools";
import { buildZezinhoSystemPrompt } from "@/lib/zezinho/generative/systemPrompt";
import { logGenerativeInteraction } from "@/lib/zezinho/generative/logger";

/**
 * Missão Z2 — orquestrador do Zézinho generativo: SESSÃO/ROLE (já resolvida por quem chama,
 * nunca aqui) -> tools filtradas por RBAC -> modelo generativo -> tool calling -> dados reais ->
 * resposta. Nunca decide autorização (isso é `tools.ts`/`executor.ts`, código determinístico) —
 * só conversa e decide QUANDO chamar uma ferramenta já autorizada.
 *
 * Retorna `null` quando o modo generativo não deve ou não pôde responder (flag desligada, ou o
 * provider falhou/está sem crédito) — o chamador SEMPRE cai no pipeline determinístico
 * (`answerFreeText`) nesse caso, nunca quebra o Santa Mônica OS. Nunca lança.
 */

export interface GenerativeMessage {
  role: "user" | "assistant";
  content: string;
}

/** Nunca envia histórico ilimitado — últimas mensagens bastam para resolver referências ("ele", "esse"). */
const MAX_HISTORY_MESSAGES = 10;
/** Teto de chamadas de ferramenta por pergunta — nunca um loop sem fim mesmo se o modelo insistir. */
const MAX_TOOL_STEPS = 6;

export interface GenerativeAnswer {
  text: string;
  toolsCalled: string[];
}

/**
 * Missão Z2.1/Z3/Z3.2 — modelos "gpt-oss" (formato Harmony) às vezes vazam os marcadores de
 * canal interno como texto literal na resposta. Três variações reais já observadas em produção:
 * "analysis...raciocínio...assistantfinal...resposta" (texto puro), "<|channel|>final<|message|>
 * ...resposta" (tokens de controle literais), e um "final"/"analysis" solto colado direto no
 * início da resposta (ex.: "finalPelo que encontrei..."). Nunca mostrar esse raciocínio ao
 * usuário — quando qualquer um dos marcadores aparece, mantém só o que vem depois do ÚLTIMO
 * encontrado (o mais à direita = o canal final de verdade).
 */
function stripLeakedReasoningChannel(text: string): string {
  const markers = ["<|channel|>final<|message|>", "assistantfinal"];
  let bestIdx = -1;
  let bestMarkerLength = 0;
  for (const marker of markers) {
    const idx = text.lastIndexOf(marker);
    if (idx > bestIdx) {
      bestIdx = idx;
      bestMarkerLength = marker.length;
    }
  }
  const stage1 = bestIdx === -1 ? text : text.slice(bestIdx + bestMarkerLength);
  // Nome de canal solto colado no início (sem espaço, seguido de maiúscula/aspas/dígito/parêntese
  // — nunca uma palavra real em português nessa posição) — cobre o caso "finalPelo que..." acima.
  const stage2 = stage1.replace(/^(analysis|commentary|final)(?=["'(A-ZÀ-Ú0-9])/, "");
  return stage2.trim();
}

export async function answerGenerative(freeText: string, history: GenerativeMessage[], role: UserRole): Promise<GenerativeAnswer | null> {
  const config = getGenerativeConfig();
  if (!config.enabled) return null;

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const tools = buildZezinhoTools(role);
  const start = Date.now();

  try {
    const result = await generateText({
      model: config.model,
      system: buildZezinhoSystemPrompt(),
      messages: [...trimmedHistory, { role: "user" as const, content: freeText }],
      tools,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
    });

    const toolsCalled = result.toolCalls.map((call) => call.toolName);
    logGenerativeInteraction({
      role,
      model: config.model,
      question: freeText,
      toolsCalled,
      stepCount: result.steps.length,
      durationMs: Date.now() - start,
      outcome: "ok",
      groundedInRealSource: toolsCalled.length > 0,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
    });

    return { text: stripLeakedReasoningChannel(result.text), toolsCalled };
  } catch (error) {
    logGenerativeInteraction({
      role,
      model: config.model,
      question: freeText,
      toolsCalled: [],
      stepCount: 0,
      durationMs: Date.now() - start,
      outcome: "provider_error",
      groundedInRealSource: false,
      errorName: error instanceof Error ? error.constructor.name : "unknown",
    });
    return null;
  }
}
