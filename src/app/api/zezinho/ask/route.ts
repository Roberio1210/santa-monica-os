import { NextResponse } from "next/server";
import { answerFreeText, EMPTY_REASONING_SESSION } from "@/lib/zezinho/service";
import { isValidIsoDate } from "@/lib/utils/timezone";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import { OBJECTIVE_DATA_AVAILABILITY, type BusinessObjective } from "@/lib/zezinho/objective/types";
import type { PeriodRange } from "@/lib/utils/timezone";

/**
 * Único endpoint do chat do Zézinho — recebe texto livre + memória conversacional (mantida no
 * cliente, nunca persistida no servidor) e retorna a resposta. O modelo (quando houver um
 * provedor de IA configurado no futuro) nunca acessa banco, token ou variável de ambiente
 * diretamente: só este endpoint, que só chama funções internas autorizadas (answerFreeText).
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

  const { freeText, context } = (body ?? {}) as { freeText?: unknown; context?: unknown };
  if (typeof freeText !== "string" || freeText.trim().length === 0) {
    return NextResponse.json({ error: "Digite uma pergunta." }, { status: 400 });
  }
  // Limite defensivo — nunca processa um texto absurdamente grande vindo do cliente.
  const safeText = freeText.slice(0, 2000);

  const startedAt = Date.now();
  try {
    const { answer, nextContext } = await answerFreeText(safeText, sanitizeContext(context));
    return NextResponse.json({ answer, nextContext, durationMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar os dados.", durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
