import { describe, expect, it } from "vitest";
import { AdvanceCompensationError, applyAdvanceCompensation, computeAdvanceOutstanding, computeAdvanceStatus } from "@/lib/hr/advances";

describe("computeAdvanceStatus / computeAdvanceOutstanding — Missão 86", () => {
  it("1) adiantamento recém-criado, sem nenhuma compensação -> aberto, saldo = valor original", () => {
    const advance = { amount: 100, compensatedAmount: 0 };
    expect(computeAdvanceStatus(advance)).toBe("aberto");
    expect(computeAdvanceOutstanding(advance)).toBe(100);
  });

  it("2) compensação parcial -> parcialmente_compensado, saldo = diferença", () => {
    const advance = { amount: 100, compensatedAmount: 40 };
    expect(computeAdvanceStatus(advance)).toBe("parcialmente_compensado");
    expect(computeAdvanceOutstanding(advance)).toBe(60);
  });

  it("3) compensação total -> compensado, saldo zero", () => {
    const advance = { amount: 100, compensatedAmount: 100 };
    expect(computeAdvanceStatus(advance)).toBe("compensado");
    expect(computeAdvanceOutstanding(advance)).toBe(0);
  });

  it("4) saldo de adiantamento nunca fica negativo, mesmo com dado inconsistente (compensação > valor)", () => {
    const advance = { amount: 100, compensatedAmount: 150 };
    expect(computeAdvanceOutstanding(advance)).toBe(0);
    expect(computeAdvanceStatus(advance)).toBe("compensado");
  });
});

describe("applyAdvanceCompensation — Missão 86", () => {
  it("aplica compensação parcial corretamente", () => {
    const result = applyAdvanceCompensation({ amount: 100, compensatedAmount: 0 }, 40);
    expect(result.compensatedAmount).toBe(40);
    expect(result.status).toBe("parcialmente_compensado");
  });

  it("aplica compensação que fecha o adiantamento -> compensado", () => {
    const result = applyAdvanceCompensation({ amount: 100, compensatedAmount: 40 }, 60);
    expect(result.compensatedAmount).toBe(100);
    expect(result.status).toBe("compensado");
  });

  it("nunca permite compensar mais do que o saldo em aberto", () => {
    expect(() => applyAdvanceCompensation({ amount: 100, compensatedAmount: 40 }, 61)).toThrow(AdvanceCompensationError);
  });

  it("nunca aceita compensação zero ou negativa", () => {
    expect(() => applyAdvanceCompensation({ amount: 100, compensatedAmount: 0 }, 0)).toThrow(AdvanceCompensationError);
    expect(() => applyAdvanceCompensation({ amount: 100, compensatedAmount: 0 }, -10)).toThrow(AdvanceCompensationError);
  });
});
