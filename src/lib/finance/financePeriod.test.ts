import { describe, expect, it } from "vitest";
import { financePeriodToSearchParams, MIN_OPERATIONAL_DATE, periodDisplayLabel, resolveFinancePeriod, FINANCE_PERIOD_KEYS } from "@/lib/finance/financePeriod";
import { resolvePeriod } from "@/lib/utils/timezone";

describe("resolveFinancePeriod — Missão Financeiro 5C", () => {
  it("sem `periodo`, cai em 'month' (Este mês) — nunca uma aba de análise vazia por padrão", () => {
    expect(resolveFinancePeriod({}).key).toBe("month");
  });

  it("`periodo` desconhecido também cai em 'month'", () => {
    expect(resolveFinancePeriod({ periodo: "sla-o-que-e-isso" }).key).toBe("month");
  });

  it("today/yesterday/month/previous_month resolvem normalmente", () => {
    expect(resolveFinancePeriod({ periodo: "today" }).key).toBe("today");
    expect(resolveFinancePeriod({ periodo: "yesterday" }).key).toBe("yesterday");
    expect(resolveFinancePeriod({ periodo: "previous_month" }).key).toBe("previous_month");
  });

  it("10) intervalo personalizado (custom) com inicio/fim explícitos", () => {
    const r = resolveFinancePeriod({ periodo: "custom", inicio: "2026-04-01", fim: "2026-04-30" });
    expect(r).toMatchObject({ key: "custom", from: "2026-04-01", to: "2026-04-30" });
  });

  it("13) intervalo personalizado invertido nunca fica invertido — inicio/fim são trocados", () => {
    const r = resolveFinancePeriod({ periodo: "custom", inicio: "2026-04-30", fim: "2026-04-01" });
    expect(r.from <= r.to).toBe(true);
    expect(r.from).toBe("2026-04-01");
    expect(r.to).toBe("2026-04-30");
  });

  it("mês/ano específico resolvem via `mes`/`ano`", () => {
    const r = resolveFinancePeriod({ periodo: "specific_month", mes: "1", ano: "2026" });
    expect(r).toMatchObject({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("14) data anterior a 01/01/2026 nunca é usada — sempre clampada ao piso operacional", () => {
    const r = resolveFinancePeriod({ periodo: "custom", inicio: "2025-06-01", fim: "2025-12-31" });
    expect(r.from).toBe(MIN_OPERATIONAL_DATE);
    // todo o intervalo pedido era anterior ao piso — colapsa num único dia no piso, nunca inventa dado de 2025
    expect(r.to).toBe(MIN_OPERATIONAL_DATE);
  });

  it("14b) intervalo que começa antes do piso mas termina depois: `from` clampado, `to` original preservado", () => {
    const r = resolveFinancePeriod({ periodo: "custom", inicio: "2025-11-01", fim: "2026-01-15" });
    expect(r.from).toBe(MIN_OPERATIONAL_DATE);
    expect(r.to).toBe("2026-01-15");
  });

  it("ano específico anterior a 2026 também é clampado ao piso operacional", () => {
    const r = resolveFinancePeriod({ periodo: "specific_year", ano: "2025" });
    expect(r.from).toBe(MIN_OPERATIONAL_DATE);
  });

  it("presets normais (today/yesterday/month/previous_month) nunca são afetados pelo piso — 2026 real nunca alcança 2025", () => {
    for (const key of ["today", "yesterday", "month", "previous_month"]) {
      const r = resolveFinancePeriod({ periodo: key });
      expect(r.from >= MIN_OPERATIONAL_DATE).toBe(true);
    }
  });

  it("o piso operacional NUNCA afeta o utilitário genérico `resolvePeriod` usado por outras páginas (ex.: previous_month a partir de um referenceDate histórico continua funcionando)", () => {
    const jan = new Date("2026-01-15T15:00:00.000Z");
    const r = resolvePeriod("previous_month", undefined, jan);
    expect(r.from).toBe("2025-12-01"); // dezembro/2025 — nunca clampado, porque o piso é só da Central Financeira
  });
});

describe("12) URL como estado — round-trip (refresh preserva o período) — Missão Financeiro 5C", () => {
  it("financePeriodToSearchParams → resolveFinancePeriod reproduz exatamente o mesmo período (preset simples)", () => {
    const original = resolveFinancePeriod({ periodo: "previous_month" });
    const params = financePeriodToSearchParams(original);
    const roundTrip = resolveFinancePeriod(Object.fromEntries(params.entries()));
    expect(roundTrip).toEqual(original);
  });

  it("round-trip funciona para specific_month", () => {
    const original = resolveFinancePeriod({ periodo: "specific_month", mes: "3", ano: "2026" });
    const params = financePeriodToSearchParams(original);
    const roundTrip = resolveFinancePeriod(Object.fromEntries(params.entries()));
    expect(roundTrip).toEqual(original);
  });

  it("round-trip funciona para custom", () => {
    const original = resolveFinancePeriod({ periodo: "custom", inicio: "2026-02-01", fim: "2026-02-20" });
    const params = financePeriodToSearchParams(original);
    const roundTrip = resolveFinancePeriod(Object.fromEntries(params.entries()));
    expect(roundTrip).toEqual(original);
  });
});

describe("11) URL preserva o período ao trocar de aba — Missão Financeiro 5C", () => {
  it("financePeriodToSearchParams nunca inclui `tab` — o período é sempre independente da aba ativa", () => {
    const period = resolveFinancePeriod({ periodo: "specific_month", mes: "5", ano: "2026" });
    const params = financePeriodToSearchParams(period);
    expect(params.has("tab")).toBe(false);
  });

  it("os mesmos parâmetros de período aparecem independente de qual aba está sendo montada (simula troca de aba no shell)", () => {
    const period = resolveFinancePeriod({ periodo: "custom", inicio: "2026-06-01", fim: "2026-06-10" });
    const forDre = financePeriodToSearchParams(period);
    forDre.set("tab", "dre");
    const forDespesas = financePeriodToSearchParams(period);
    forDespesas.set("tab", "despesas");
    expect(forDre.get("periodo")).toBe(forDespesas.get("periodo"));
    expect(forDre.get("inicio")).toBe(forDespesas.get("inicio"));
    expect(forDre.get("fim")).toBe(forDespesas.get("fim"));
  });
});

describe("periodDisplayLabel — Missão Financeiro 5C, item 6", () => {
  it("mês calendário completo (passado) mostra 'Mês de Ano'", () => {
    const period = resolveFinancePeriod({ periodo: "specific_month", mes: "4", ano: "2026" });
    expect(periodDisplayLabel(period)).toBe("Abril de 2026");
  });

  it("um único dia mostra a data por extenso", () => {
    const period = resolveFinancePeriod({ periodo: "custom", inicio: "2026-03-10", fim: "2026-03-10" });
    expect(periodDisplayLabel(period)).toBe("10/03/2026");
  });

  it("intervalo personalizado que não é um mês inteiro mostra 'data — data'", () => {
    const period = resolveFinancePeriod({ periodo: "custom", inicio: "2026-04-15", fim: "2026-05-15" });
    expect(periodDisplayLabel(period)).toBe("15/04/2026 — 15/05/2026");
  });
});

describe("FINANCE_PERIOD_KEYS — presets exatamente os pedidos pela Missão 5C", () => {
  it("contém exatamente os 7 presets pedidos, nenhum a mais/menos", () => {
    expect(FINANCE_PERIOD_KEYS).toEqual(["today", "yesterday", "month", "previous_month", "specific_month", "specific_year", "custom"]);
  });
});
