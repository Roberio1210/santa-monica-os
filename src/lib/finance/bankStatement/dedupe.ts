import { createHash } from "node:crypto";
import type { BankStatementLineDirection } from "@/lib/finance/bankStatement/types";

/**
 * Determinístico — reimportar o mesmo extrato (mesmo arquivo, ou um novo export do mesmo
 * período) nunca duplica linhas: mesma conta+data+direção+valor+descrição+contraparte produzem a
 * mesma chave. `occurrenceIndex` distingue duas transações genuinamente idênticas no mesmo dia
 * (ex.: dois Pix de R$ 50,00 do mesmo pagador) — calculado contando quantas linhas anteriores no
 * mesmo lote (ou já persistidas) têm exatamente o mesmo conteúdo.
 */
export function normalizeDescriptionForDedupe(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export interface DedupeKeyInput {
  financialAccountId: string;
  date: string;
  direction: BankStatementLineDirection;
  amount: number;
  description: string;
  counterparty: string | null;
  occurrenceIndex: number;
}

export function computeDedupeKey(input: DedupeKeyInput): string {
  const amountCents = Math.round(input.amount * 100);
  const normalizedDescription = normalizeDescriptionForDedupe(input.description);
  const normalizedCounterparty = input.counterparty ? normalizeDescriptionForDedupe(input.counterparty) : "";
  const payload = [input.financialAccountId, input.date, input.direction, String(amountCents), normalizedDescription, normalizedCounterparty, String(input.occurrenceIndex)].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/** Chave de conteúdo (sem occurrenceIndex) — usada para contar ocorrências dentro de um mesmo lote. */
function contentKey(input: Omit<DedupeKeyInput, "occurrenceIndex">): string {
  const amountCents = Math.round(input.amount * 100);
  const normalizedDescription = normalizeDescriptionForDedupe(input.description);
  const normalizedCounterparty = input.counterparty ? normalizeDescriptionForDedupe(input.counterparty) : "";
  return [input.financialAccountId, input.date, input.direction, String(amountCents), normalizedDescription, normalizedCounterparty].join("|");
}

/**
 * Calcula o `occurrenceIndex` de cada linha de um lote, em ordem — a primeira ocorrência de um
 * conteúdo é 0, a segunda é 1, etc. Chamado sobre as linhas do arquivo sendo importado, na ordem
 * em que aparecem (nunca reordenado), para que reimportar o mesmo arquivo produza os mesmos
 * índices.
 */
export function assignOccurrenceIndices<T extends Omit<DedupeKeyInput, "occurrenceIndex">>(lines: T[]): (T & { occurrenceIndex: number })[] {
  const counts = new Map<string, number>();
  return lines.map((line) => {
    const key = contentKey(line);
    const occurrenceIndex = counts.get(key) ?? 0;
    counts.set(key, occurrenceIndex + 1);
    return { ...line, occurrenceIndex };
  });
}
