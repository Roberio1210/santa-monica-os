import { describe, expect, it } from "vitest";
import { computePeriodComparison, detectPersistentDeviation, type PeriodComparison } from "@/lib/inventory/calibration-comparison";

describe("computePeriodComparison — teórico vs físico (Automação JumpPark → Consumo, seção 10)", () => {
  it("exemplo da missão: previsto 1650, real 2100 → desvio +27%", () => {
    const result = computePeriodComparison("item-1", "2026-07-12", "2026-08-11", 1650, 2100);
    expect(result.differenceAbsolute).toBe(450);
    expect(result.differencePercent).toBe(27.3);
  });

  it("sem consumo teórico (nenhuma receita aplicada no período), diferença nunca calculada", () => {
    const result = computePeriodComparison("item-1", "2026-07-12", "2026-08-11", null, 500);
    expect(result.differenceAbsolute).toBeNull();
    expect(result.differencePercent).toBeNull();
  });

  it("consumo real abaixo do previsto gera diferença negativa", () => {
    const result = computePeriodComparison("item-1", "2026-07-12", "2026-08-11", 1000, 800);
    expect(result.differenceAbsolute).toBe(-200);
    expect(result.differencePercent).toBe(-20);
  });
});

describe("detectPersistentDeviation — desperdício só após 2+ períodos consecutivos (seção 11)", () => {
  function comparison(differencePercent: number | null): PeriodComparison {
    return { itemId: "item-1", periodFrom: "2026-07-01", periodTo: "2026-07-31", theoreticalConsumption: 1000, observedConsumption: 1000, differenceAbsolute: 0, differencePercent };
  }

  it("nunca alerta com uma única contagem, mesmo com desvio grande", () => {
    expect(detectPersistentDeviation([comparison(50)])).toBe(false);
  });

  it("alerta quando as últimas 2 comparações consecutivas excedem o limiar", () => {
    expect(detectPersistentDeviation([comparison(25), comparison(30)])).toBe(true);
  });

  it("não alerta quando só a mais recente excede o limiar (falta persistência)", () => {
    expect(detectPersistentDeviation([comparison(5), comparison(30)])).toBe(false);
  });

  it("não alerta quando o desvio está dentro do limiar normal", () => {
    expect(detectPersistentDeviation([comparison(10), comparison(15)])).toBe(false);
  });
});
