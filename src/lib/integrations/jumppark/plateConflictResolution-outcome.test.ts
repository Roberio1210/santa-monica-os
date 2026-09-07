import { describe, expect, it } from "vitest";
import { outcomeToActionState } from "./plateConflictResolution";

/**
 * Missão 28 (Etapa E6) — testes V/W: a UI sempre mostra sucesso e erro corretamente, nunca
 * esconde falha. `outcomeToActionState` é pura (sem I/O) — traduz o resultado de domínio para o
 * formato `{error, success}` que `useActionState` usa.
 */
describe("outcomeToActionState — Missão 28 (V/W)", () => {
  it("V. resolved -> success preenchido, error nulo", () => {
    const state = outcomeToActionState({ status: "resolved", newStatus: "linked" }, "Confirmado.");
    expect(state).toEqual({ error: null, success: "Confirmado." });
  });

  it("W1. not_found -> error preenchido, success nulo", () => {
    const state = outcomeToActionState({ status: "not_found" }, "Confirmado.");
    expect(state.success).toBeNull();
    expect(state.error).toContain("não encontrado");
  });

  it("W2. already_resolved -> error preenchido, menciona o status atual", () => {
    const state = outcomeToActionState({ status: "already_resolved", currentStatus: "kept_separate" }, "Confirmado.");
    expect(state.success).toBeNull();
    expect(state.error).toContain("kept_separate");
  });

  it("W3. invalid_evidence -> error preenchido, inclui o motivo original", () => {
    const state = outcomeToActionState({ status: "invalid_evidence", reason: "motivo específico de teste" }, "Confirmado.");
    expect(state.success).toBeNull();
    expect(state.error).toContain("motivo específico de teste");
  });

  it("nunca preenche error e success ao mesmo tempo", () => {
    const outcomes: Parameters<typeof outcomeToActionState>[0][] = [
      { status: "resolved", newStatus: "kept_separate" },
      { status: "not_found" },
      { status: "already_resolved", currentStatus: "deferred" },
      { status: "invalid_evidence", reason: "x" },
    ];
    for (const outcome of outcomes) {
      const state = outcomeToActionState(outcome, "ok");
      expect(state.error === null || state.success === null).toBe(true);
      expect(state.error !== null || state.success !== null).toBe(true);
    }
  });
});
