import { describe, expect, it } from "vitest";
import { classifyReceivableState, type ReceivableStateInput } from "@/lib/integrations/stone/receivableState";

function input(overrides: Partial<ReceivableStateInput> = {}): ReceivableStateInput {
  return { expectedPaymentDate: "2026-07-25", settledPaymentDate: null, cancelled: false, chargeback: false, dataAvailableThroughDate: "2026-07-24", ...overrides };
}

describe("classifyReceivableState — Sprint 7.0, Z3, decisão do usuário", () => {
  it("teste 1 — recebível futuro (previsto depois da nossa janela de visibilidade) é scheduled", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: "2026-08-01", dataAvailableThroughDate: "2026-07-24" }))).toBe("scheduled");
  });

  it("teste 2 — vencimento exatamente na borda da visibilidade é due_today", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: "2026-07-24", dataAvailableThroughDate: "2026-07-24" }))).toBe("due_today");
  });

  it("teste 3 — liquidado exatamente na data prevista é settled_on_time", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: "2026-07-20", settledPaymentDate: "2026-07-20" }))).toBe("settled_on_time");
  });

  it("teste 4 — liquidado antes da data prevista é settled_early", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: "2026-07-25", settledPaymentDate: "2026-07-10" }))).toBe("settled_early");
  });

  it("teste 5 — previsto antes da nossa janela de visibilidade, sem liquidação, é overdue", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: "2026-07-01", dataAvailableThroughDate: "2026-07-24", settledPaymentDate: null }))).toBe("overdue");
  });

  it("teste 6 — cancelado antes de qualquer liquidação é cancelled", () => {
    expect(classifyReceivableState(input({ cancelled: true, settledPaymentDate: null }))).toBe("cancelled");
  });

  it("teste 7 — cancelado depois de já liquidado é reversed (dinheiro saiu e voltou)", () => {
    expect(classifyReceivableState(input({ cancelled: true, settledPaymentDate: "2026-07-20" }))).toBe("reversed");
  });

  it("teste 8 — chargeback sempre vence qualquer outro sinal, mesmo com liquidação/cancelamento simultâneos", () => {
    expect(classifyReceivableState(input({ chargeback: true, cancelled: true, settledPaymentDate: "2026-07-20" }))).toBe("chargeback");
  });

  it("sem previsão de pagamento no dado bruto é unknown, nunca um estado inventado", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: null }))).toBe("unknown");
  });

  it("liquidado depois do previsto (atraso já sanado) cai em settled_on_time — a diferença de dias fica visível na Agenda, nunca escondida nem virando um 10º estado", () => {
    expect(classifyReceivableState(input({ expectedPaymentDate: "2026-07-10", settledPaymentDate: "2026-07-15" }))).toBe("settled_on_time");
  });
});
