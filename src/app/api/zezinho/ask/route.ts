import { NextResponse } from "next/server";
import { answerFreeText, EMPTY_REASONING_SESSION } from "@/lib/zezinho/service";
import { isValidIsoDate } from "@/lib/utils/timezone";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import { OBJECTIVE_DATA_AVAILABILITY, type BusinessObjective } from "@/lib/zezinho/objective/types";
import type { PeriodRange } from "@/lib/utils/timezone";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveZezinhoCallerRole } from "@/lib/zezinho/auth/access";
import { answerGenerative, type GenerativeMessage } from "@/lib/zezinho/generative/orchestrator";

/**
 * Único endpoint do chat do Zézinho — recebe texto livre + memória conversacional (mantida no
 * cliente, nunca persistida no servidor) e retorna a resposta. O modelo (quando houver um
 * provedor de IA configurado no futuro) nunca acessa banco, token ou variável de ambiente
 * diretamente: só este endpoint, que só chama funções internas autorizadas (answerFreeText).
 *
 * Missão Z1 — a role usada em toda a resposta vem EXCLUSIVAMENTE de `getCurrentUser()` (sessão
 * autenticada, cookie httpOnly já validado contra o banco). O corpo da requisição nunca é
 * consultado para decidir identidade/role — não existe (e nunca existiu) um campo `role` aceito
 * aqui, então não há vetor para o cliente forjar privilégio.
 */

const VALID_OBJECTIVES = new Set(Object.keys(OBJECTIVE_DATA_AVAILABILITY));

function isPeriodRange(value: unknown): value is PeriodRange {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.from === "string" && isValidIsoDate(v.from) && typeof v.to === "string" && isValidIsoDate(v.to) && typeof v.label === "string" && typeof v.key === "string";
}

function isBusinessObjective(value: unknown): value is BusinessObjective {
  return typeof value === "string" && VALID_OBJECTIVES.has(value);
}

/** Aceita só um array de strings curtas, com tamanho limitado — nunca confia no tamanho/conteúdo vindo do cliente. */
function sanitizeStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 300)).slice(0, maxItems);
}

const MAX_HISTORY_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Missão Z2 — histórico conversacional do modo generativo, mantido no cliente (mesmo princípio
 * de `ReasoningSession`: nunca persistido no servidor). Nunca confia no formato recebido —
 * descarta silenciosamente qualquer entrada malformada em vez de falhar a requisição inteira.
 */
function sanitizeHistory(raw: unknown): GenerativeMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: GenerativeMessage[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { role, content } = entry as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.trim().length === 0) continue;
    messages.push({ role, content: content.slice(0, MAX_MESSAGE_LENGTH) });
  }
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

/** Sanitiza a memória recebida do cliente — nunca confia cegamente em JSON externo. */
function sanitizeContext(raw: unknown): ReasoningSession {
  if (typeof raw !== "object" || raw === null) return EMPTY_REASONING_SESSION;
  const v = raw as Record<string, unknown>;
  const activeAreaFilter = v.activeAreaFilter === "lavacao" || v.activeAreaFilter === "estacionamento" ? v.activeAreaFilter : null;

  return {
    activePeriodA: isPeriodRange(v.activePeriodA) ? v.activePeriodA : null,
    activePeriodB: isPeriodRange(v.activePeriodB) ? v.activePeriodB : null,
    activeAreaFilter,
    activeObjective: isBusinessObjective(v.activeObjective) ? v.activeObjective : null,
    lastInsightSummaries: sanitizeStringArray(v.lastInsightSummaries, 10),
    explainedMetricKeys: sanitizeStringArray(v.explainedMetricKeys, 30),
    usedNarrationOpeners: sanitizeStringArray(v.usedNarrationOpeners, 20),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { freeText, context, history } = (body ?? {}) as { freeText?: unknown; context?: unknown; history?: unknown };
  if (typeof freeText !== "string" || freeText.trim().length === 0) {
    return NextResponse.json({ error: "Digite uma pergunta." }, { status: 400 });
  }
  // Limite defensivo — nunca processa um texto absurdamente grande vindo do cliente.
  const safeText = freeText.slice(0, 2000);

  const startedAt = Date.now();
  try {
    const user = await getCurrentUser();
    const role = resolveZezinhoCallerRole(user);
    const sanitizedHistory = sanitizeHistory(history);

    // Missão Z2 — tenta o modo generativo primeiro; `answerGenerative` retorna `null` quando a
    // flag está desligada OU o provider falhou (sem crédito, sem credencial, timeout etc.) — em
    // qualquer um desses casos, cai no pipeline determinístico da Z1/Z3/Z4, nunca quebra o app.
    const generative = await answerGenerative(safeText, sanitizedHistory, role);
    if (generative) {
      const nextHistory = [...sanitizedHistory, { role: "user" as const, content: safeText }, { role: "assistant" as const, content: generative.text }];
      return NextResponse.json({
        answer: { text: generative.text, links: [] },
        nextContext: sanitizeContext(context),
        history: nextHistory,
        durationMs: Date.now() - startedAt,
      });
    }

    const { answer, nextContext } = await answerFreeText(safeText, sanitizeContext(context), role);
    return NextResponse.json({ answer, nextContext, durationMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar os dados.", durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
