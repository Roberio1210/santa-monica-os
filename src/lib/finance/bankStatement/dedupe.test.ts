import { describe, expect, it } from "vitest";
import { assignOccurrenceIndices, computeDedupeKey } from "@/lib/finance/bankStatement/dedupe";

const base = { financialAccountId: "conta-stone", date: "2026-08-01", direction: "entrada" as const, amount: 100, description: "Recebimento vendas", counterparty: null };

describe("computeDedupeKey — determinístico", () => {
  it("a mesma linha produz sempre a mesma chave", () => {
    expect(computeDedupeKey({ ...base, occurrenceIndex: 0 })).toBe(computeDedupeKey({ ...base, occurrenceIndex: 0 }));
  });

  it("descrição com acento/maiúscula diferente ainda produz a mesma chave (normalizada)", () => {
    const a = computeDedupeKey({ ...base, occurrenceIndex: 0 });
    const b = computeDedupeKey({ ...base, description: "RECEBIMENTO VENDAS", occurrenceIndex: 0 });
    expect(a).toBe(b);
  });

  it("valor diferente produz chave diferente", () => {
    const a = computeDedupeKey({ ...base, occurrenceIndex: 0 });
    const b = computeDedupeKey({ ...base, amount: 200, occurrenceIndex: 0 });
    expect(a).not.toBe(b);
  });

  it("occurrenceIndex diferente produz chave diferente — permite 2 transações idênticas no mesmo dia", () => {
    const a = computeDedupeKey({ ...base, occurrenceIndex: 0 });
    const b = computeDedupeKey({ ...base, occurrenceIndex: 1 });
    expect(a).not.toBe(b);
  });
});

describe("assignOccurrenceIndices — reimportar o mesmo arquivo produz os mesmos índices", () => {
  it("linhas distintas recebem índice 0", () => {
    const lines = [
      { ...base, description: "Recebimento vendas" },
      { ...base, description: "Pix recebido João" },
    ];
    const withIndex = assignOccurrenceIndices(lines);
    expect(withIndex.map((l) => l.occurrenceIndex)).toEqual([0, 0]);
  });

  it("duas linhas idênticas recebem índices 0 e 1, na ordem do arquivo", () => {
    const lines = [base, base, base];
    const withIndex = assignOccurrenceIndices(lines);
    expect(withIndex.map((l) => l.occurrenceIndex)).toEqual([0, 1, 2]);
  });

  it("reprocessar o mesmo array de linhas produz exatamente os mesmos índices (idempotência)", () => {
    const lines = [base, { ...base, amount: 50 }, base];
    const first = assignOccurrenceIndices(lines).map((l) => l.occurrenceIndex);
    const second = assignOccurrenceIndices(lines).map((l) => l.occurrenceIndex);
    expect(first).toEqual(second);
    expect(first).toEqual([0, 0, 1]);
  });
});
