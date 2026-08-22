import { describe, expect, it } from "vitest";
import { resolvePeriodInput } from "@/lib/zezinho/generative/periodInput";

describe("resolvePeriodInput — traduz período em linguagem natural para PeriodRange (nunca calcula data sozinho)", () => {
  it("sem nenhuma entrada -> hoje", () => {
    const range = resolvePeriodInput(undefined);
    expect(range.key).toBe("today");
  });

  it("período nomeado -> resolvePeriod correspondente", () => {
    const range = resolvePeriodInput({ periodo: "month" });
    expect(range.key).toBe("month");
  });

  it("datas explícitas válidas -> período customizado", () => {
    const range = resolvePeriodInput({ data_inicio: "2026-07-01", data_fim: "2026-07-19" });
    expect(range.key).toBe("custom");
    expect(range.from).toBe("2026-07-01");
    expect(range.to).toBe("2026-07-19");
  });

  it("data inválida -> nunca lança, cai em hoje", () => {
    const range = resolvePeriodInput({ data_inicio: "não é uma data", data_fim: "2026-07-19" });
    expect(range.key).toBe("today");
  });
});
