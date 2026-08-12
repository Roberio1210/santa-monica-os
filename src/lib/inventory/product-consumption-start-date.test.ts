import { describe, expect, it } from "vitest";
import { computeProductConsumptionStartDate } from "@/lib/inventory/product-consumption-start-date";

describe("computeProductConsumptionStartDate — Marco Confiável do Histórico de Estoque", () => {
  it("produto sem nenhuma evidência real nunca gera data de início — null", () => {
    expect(computeProductConsumptionStartDate(null)).toBeNull();
  });

  it("produto contado no marco geral (10/07) usa o marco geral", () => {
    expect(computeProductConsumptionStartDate("2026-07-10")).toBe("2026-07-10");
  });

  it("produto com evidência ANTES do marco geral ainda assim usa o marco geral (nunca antes dele)", () => {
    expect(computeProductConsumptionStartDate("2026-05-15")).toBe("2026-07-10");
  });

  it("3x1 — evidência real em 16/07 é DEPOIS do marco geral, então usa a própria data (16/07)", () => {
    expect(computeProductConsumptionStartDate("2026-07-16")).toBe("2026-07-16");
  });

  it("produto comprado em 17/07 usa 17/07, não o marco geral nem a data do 3x1", () => {
    expect(computeProductConsumptionStartDate("2026-07-17")).toBe("2026-07-17");
  });
});
