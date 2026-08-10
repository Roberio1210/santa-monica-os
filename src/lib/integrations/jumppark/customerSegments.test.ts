import { describe, expect, it } from "vitest";
import { isReactivatedInPeriod } from "@/lib/integrations/jumppark/customerSegments";

describe("isReactivatedInPeriod", () => {
  it("primeira visita de todas dentro do período -> não é reativado (é novo)", () => {
    expect(isReactivatedInPeriod(["2026-07-15"], { from: "2026-07-01", to: "2026-07-31" })).toBe(false);
  });

  it("visita no período com gap grande desde a anterior -> reativado", () => {
    const dates = ["2026-01-10", "2026-07-15"]; // ~186 dias de gap
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" })).toBe(true);
  });

  it("visita no período com gap pequeno desde a anterior -> não reativado (cliente ativo normal)", () => {
    const dates = ["2026-06-20", "2026-07-15"]; // 25 dias de gap
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" })).toBe(false);
  });

  it("gap exatamente igual ao limiar não conta como reativação (só > gapDays)", () => {
    const dates = ["2026-05-31", "2026-07-15"]; // exatamente 45 dias
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" }, 45)).toBe(false);
  });

  it("gap um dia maior que o limiar já conta", () => {
    const dates = ["2026-05-30", "2026-07-15"]; // 46 dias
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" }, 45)).toBe(true);
  });

  it("nenhuma visita dentro do período -> não reativado", () => {
    const dates = ["2026-01-10", "2026-02-15"];
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" })).toBe(false);
  });

  it("múltiplas visitas no período: basta uma delas satisfazer a condição de gap", () => {
    const dates = ["2026-01-01", "2026-07-05", "2026-07-20"]; // primeira do período (07-05) tem gap grande
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" })).toBe(true);
  });

  it("cliente com visitas frequentes ao longo do ano, uma delas no período -> nunca reativado", () => {
    const dates = ["2026-05-01", "2026-05-20", "2026-06-10", "2026-07-05"];
    expect(isReactivatedInPeriod(dates, { from: "2026-07-01", to: "2026-07-31" })).toBe(false);
  });
});
