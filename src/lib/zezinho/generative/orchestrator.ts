import "server-only";
import { generateText, stepCountIs } from "ai";
import type { UserRole } from "@/lib/auth/roles";
import { getGenerativeConfig } from "@/lib/zezinho/generative/config";
import { buildZezinhoTools } from "@/lib/zezinho/generative/tools";
import { buildZezinhoSystemPrompt } from "@/lib/zezinho/generative/systemPrompt";
import { logGenerativeInteraction } from "@/lib/zezinho/generative/logger";
import { resolveAdminActorFromPhone } from "@/lib/management/inboundMessages";
import { applyToolPolicy, type ToolPolicy } from "@/lib/zezinho/generative/toolPolicy";

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

/** Missão "Regra Absoluta de Envio" — identidade real de quem está conversando, resolvida pelo chamador a partir da sessão (nunca inferida aqui, nunca do texto da conversa). `null` quando não há sessão (mesmo caso que já resolve `role` para "operacional"). */
export interface GenerativeActor {
  id: string;
  name: string;
}

/**
 * Missão Z6.5 — mesma soberania de identidade do `GenerativeActor` de sessão HTTP, agora para o
 * canal WhatsApp: resolve um `actor` real SÓ a partir do telefone do remetente já verificado pela
 * assinatura do webhook (`X-Hub-Signature-256`, validada em `route.ts` antes de qualquer parsing)
 * — nunca a partir do texto da mensagem. Um telefone fora de `whatsapp_admin_numbers` sempre
 * devolve `null`, não importa o que a mensagem diga ("sou admin", "aprovo tudo" etc. não têm
 * nenhum efeito aqui — esta função nem recebe o texto da mensagem como parâmetro).
 *
 * IMPORTANTE — escopo desta missão: esta função só RESOLVE IDENTIDADE. Nenhum chamador desta
 * função aciona `answerGenerative`/ferramentas/resposta automática a partir do resultado — isso é
 * trabalho de uma missão futura, explícita ("não habilitar respostas automáticas ainda").
 */
export async function resolveWhatsAppAdminActor(phoneE164: string): Promise<GenerativeActor | null> {
  const admin = await resolveAdminActorFromPhone(phoneE164);
  if (!admin) return null;
  return { id: admin.id, name: admin.name };
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
  // Nome de canal solto colado no início (sem espaço nenhum antes do conteúdo real) — regra
  // GERAL em vez de uma lista de caracteres permitidos: depois de dois achados reais em produção
  // só com listas específicas ("finalPelo...", "final**Fechamento...") um terceiro apareceu com
  // markdown diferente ("final### Fechamento...", confirmação real autenticada como admin,
  // Missão Z4) — todo novo estilo de abertura do modelo (heading, citação, lista) quebraria uma
  // lista fixa de novo. A regra segura é o oposto: um "final"/"analysis"/"commentary" bruto NUNCA
  // é seguido de uma letra minúscula (isso indicaria uma palavra real em português, ex.:
  // "finalizar", "finalmente") nem de espaço (frase real começando com a própria palavra "final",
  // ex.: "final ajuste feito com sucesso.") — em QUALQUER outro caso (maiúscula, dígito, aspas,
  // parênteses, ou qualquer marcador de markdown: *, #, -, >, `, etc.) é sempre o vazamento.
  const stage2 = stage1.replace(/^(analysis|commentary|final)(?![a-zà-üç\s])/, "");
  return stage2.trim();
}

/**
 * Missão Z6.6 — `toolPolicy` ("full" por padrão, preserva 100% o comportamento já existente da
 * sessão HTTP/Web) permite ao canal WhatsApp administrativo pedir "conversational_read_only":
 * mesmo cérebro, mesmo prompt, mesmas ferramentas de LEITURA — só as 3 ferramentas com efeito
 * colateral somem do conjunto exposto ao modelo (`toolPolicy.ts`). Nenhuma lógica generativa
 * paralela — é o MESMO `answerGenerative` de sempre, só com um filtro a mais sobre o `tools`.
 */
export async function answerGenerative(
  freeText: string,
  history: GenerativeMessage[],
  role: UserRole,
  actor: GenerativeActor | null = null,
  toolPolicy: ToolPolicy = "full",
): Promise<GenerativeAnswer | null> {
  const config = getGenerativeConfig();
  if (!config.enabled) return null;

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const tools = applyToolPolicy(buildZezinhoTools(role, actor), toolPolicy);
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
