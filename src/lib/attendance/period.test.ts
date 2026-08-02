import { describe, expect, it } from "vitest";
import { parseDayPeriodParam, resolveDayPeriod } from "@/lib/attendance/period";

describe("resolveDayPeriod", () => {
  it("hoje: from e to são o mesmo dia", () => {
    const range = resolveDayPeriod("hoje", "2026-08-02");
    expect(range).toEqual({ key: "hoje", from: "2026-08-02", to: "2026-08-02", label: "Hoje" });
  });

  it("ontem: from e to são o dia anterior", () => {
    const range = resolveDayPeriod("ontem", "2026-08-02");
    expect(range.from).toBe("2026-08-01");
    expect(range.to).toBe("2026-08-01");
  });

  it("7d: cobre os últimos 7 dias incluindo hoje", () => {
    const range = resolveDayPeriod("7d", "2026-08-02");
    expect(range.from).toBe("2026-07-27");
    expect(range.to).toBe("2026-08-02");
  });

  it("30d: cobre os últimos 30 dias incluindo hoje", () => {
    const range = resolveDayPeriod("30d", "2026-08-02");
    expect(range.from).toBe("2026-07-04");
    expect(range.to).toBe("2026-08-02");
  });

  it("todos: from é uma data mínima real, nunca null — mantém o repositório com uma única forma de consulta", () => {
    const range = resolveDayPeriod("todos", "2026-08-02");
    expect(range.from < "2026-01-01").toBe(true);
    expect(range.to).toBe("2026-08-02");
  });
});

describe("parseDayPeriodParam", () => {
  it("aceita uma chave válida", () => {
    expect(parseDayPeriodParam("7d")).toBe("7d");
  });

  it("cai para hoje com valor ausente ou inválido, nunca lança erro", () => {
    expect(parseDayPeriodParam(undefined)).toBe("hoje");
    expect(parseDayPeriodParam("lixo")).toBe("hoje");
  });
});
