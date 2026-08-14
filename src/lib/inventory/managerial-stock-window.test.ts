import { describe, expect, it } from "vitest";
import { computeEffectivePeriodStart, sumEntradasFromMovements } from "@/lib/inventory/managerial-stock-window";

describe("sumEntradasFromMovements — Missão de Wiring do Consumo Gerencial V1, seção 10", () => {
  it("entrada de compra soma corretamente", () => {
    const result = sumEntradasFromMovements([
      { type: "compra", quantity: 1000 },
      { type: "entrada", quantity: 500 },
    ]);
    expect(result).toBe(1500);
  });

  it("saída não é tratada como entrada", () => {
    const result = sumEntradasFromMovements([
      { type: "compra", quantity: 1000 },
      { type: "saida", quantity: 200 },
      { type: "consumo_interno", quantity: 50 },
    ]);
    expect(result).toBe(1000);
  });

  it("ajuste/correção/transferência/devolução nunca são interpretados como compra sem verificação", () => {
    const result = sumEntradasFromMovements([
      { type: "ajuste_positivo", quantity: 300 },
      { type: "ajuste_negativo", quantity: 100 },
      { type: "transferencia", quantity: 50 },
      { type: "devolucao", quantity: 20 },
      { type: "correcao_inventario", quantity: 10 },
      { type: "ajuste_inventario", quantity: 5 },
      { type: "contagem_fisica_inicial", quantity: 999 },
    ]);
    expect(result).toBe(0);
  });

  it("zero movimentações → zero entradas, nunca null (0 é um valor válido, diferente de ausência de dado)", () => {
    expect(sumEntradasFromMovements([])).toBe(0);
  });
});

describe("computeEffectivePeriodStart — Missão de Wiring do Consumo Gerencial V1, seção 9", () => {
  it("produto anterior à data confiável não fabrica histórico — período efetivo adia para a primeira evidência real", () => {
    const result = computeEffectivePeriodStart("2026-08-01", "2026-08-12");
    expect(result).toBe("2026-08-12");
  });

  it("quando o período pedido já começa depois da primeira evidência, não adia", () => {
    const result = computeEffectivePeriodStart("2026-08-15", "2026-08-12");
    expect(result).toBe("2026-08-15");
  });

  it("produto sem nenhuma evidência (null) mantém o período pedido — a ausência de saldo será sinalizada em outro campo, não aqui", () => {
    const result = computeEffectivePeriodStart("2026-08-01", null);
    expect(result).toBe("2026-08-01");
  });
});
