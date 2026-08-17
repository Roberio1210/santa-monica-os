import { describe, expect, it } from "vitest";
import { resolveCashFlowPeriod } from "@/lib/finance/period";

const ASOF = "2026-08-15";

describe("resolveCashFlowPeriod", () => {
  it("hoje: from e to são a própria asOfDate", () => {
    expect(resolveCashFlowPeriod("hoje", ASOF)).toEqual({ from: ASOF, to: ASOF });
  });

  it("7_dias: janela de 7 dias inclusive, terminando em asOfDate", () => {
    expect(resolveCashFlowPeriod("7_dias", ASOF)).toEqual({ from: "2026-08-09", to: "2026-08-15" });
  });

  it("mes_atual: do dia 1 do mês até asOfDate", () => {
    expect(resolveCashFlowPeriod("mes_atual", ASOF)).toEqual({ from: "2026-08-01", to: "2026-08-15" });
  });

  it("mes_anterior: mês calendário completo anterior", () => {
    expect(resolveCashFlowPeriod("mes_anterior", ASOF)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("mes_anterior na virada do ano", () => {
    expect(resolveCashFlowPeriod("mes_anterior", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("personalizado: usa customFrom/customTo quando válidos", () => {
    expect(resolveCashFlowPeriod("personalizado", ASOF, "2026-06-01", "2026-06-30")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("personalizado sem datas cai em hoje — nunca inventa um intervalo", () => {
    expect(resolveCashFlowPeriod("personalizado", ASOF)).toEqual({ from: ASOF, to: ASOF });
  });

  it("personalizado com from > to cai em hoje", () => {
    expect(resolveCashFlowPeriod("personalizado", ASOF, "2026-08-20", "2026-08-01")).toEqual({ from: ASOF, to: ASOF });
  });
});
