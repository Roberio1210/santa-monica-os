import { NextResponse } from "next/server";
import { answerFreeText, EMPTY_ZEZINHO_CONTEXT } from "@/lib/zezinho/service";
import { isValidIsoDate } from "@/lib/utils/timezone";
import type { ZezinhoContext } from "@/lib/zezinho/types";
import type { PeriodRange } from "@/lib/utils/timezone";

/**
 * Único endpoint do chat do Zézinho — recebe texto livre + contexto conversacional (mantido no
 * cliente, nunca persistido no servidor) e retorna a resposta. O modelo (quando houver um
 * provedor de IA configurado no futuro) nunca acessa banco, token ou variável de ambiente
 * diretamente: só este endpoint, que só chama funções internas autorizadas (answerFreeText).
 */

function isPeriodRange(value: unknown): value is PeriodRange {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.from === "string" && isValidIsoDate(v.from) && typeof v.to === "string" && isValidIsoDate(v.to) && typeof v.label === "string" && typeof v.key === "string";
}

/** Sanitiza o contexto recebido do cliente — nunca confia cegamente em JSON externo. */
function sanitizeContext(raw: unknown): ZezinhoContext {
  if (typeof raw !== "object" || raw === null) return EMPTY_ZEZINHO_CONTEXT;
  const v = raw as Record<string, unknown>;
  const lastKindFilter = v.lastKindFilter === "lavacao" || v.lastKindFilter === "estacionamento" ? v.lastKindFilter : null;
  return {
    lastPeriodA: isPeriodRange(v.lastPeriodA) ? v.lastPeriodA : null,
    lastPeriodB: isPeriodRange(v.lastPeriodB) ? v.lastPeriodB : null,
    lastKindFilter,
    lastTopic: typeof v.lastTopic === "string" ? v.lastTopic.slice(0, 100) : null,
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
