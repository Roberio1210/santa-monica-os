import { describe, expect, it } from "vitest";
import { addDaysIso, comparePeriodValues, isValidIsoDate, parsePeriodParams, previousPeriodOf, resolvePeriod, saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";

describe("saoPauloDateISO", () => {
  it("converte um instante UTC tarde da noite (já virado para o dia seguinte em UTC) para a data correta em SP", () => {
    // 2026-07-18 23:30 em America/Sao_Paulo (UTC-3) = 2026-07-19 02:30 UTC.
    const utcInstant = new Date("2026-07-19T02:30:00.000Z");
    expect(saoPauloDateISO(utcInstant)).toBe("2026-07-18");
  });

  it("madrugada em UTC ainda é o dia anterior em SP", () => {
    // 2026-07-18 01:00 UTC = 2026-07-17 22:00 em SP.
    const utcInstant = new Date("2026-07-18T01:00:00.000Z");
    expect(saoPauloDateISO(utcInstant)).toBe("2026-07-17");
  });
});

describe("saoPauloTimeHM", () => {
  it("formata HH:mm no fuso de SP", () => {
    const utcInstant = new Date("2026-07-18T23:05:00.000Z");
    expect(saoPauloTimeHM(utcInstant)).toBe("20:05");
  });
});

describe("addDaysIso", () => {
  it("soma dias sem cair em problema de fuso", () => {
    expect(addDaysIso("2026-07-18", 1)).toBe("2026-07-19");
    expect(addDaysIso("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("resolvePeriod", () => {
  const reference = new Date("2026-07-18T15:00:00.000Z"); // sábado, 18/07/2026 em SP

  it("today", () => {
    expect(resolvePeriod("today", undefined, reference)).toEqual({ key: "today", from: "2026-07-18", to: "2026-07-18", label: "Hoje" });
  });

  it("yesterday", () => {
    expect(resolvePeriod("yesterday", undefined, reference)).toEqual({ key: "yesterday", from: "2026-07-17", to: "2026-07-17", label: "Ontem" });
  });

  it("last7days inclui hoje e os 6 dias anteriores", () => {
    const r = resolvePeriod("last7days", undefined, reference);
    expect(r.from).toBe("2026-07-12");
    expect(r.to).toBe("2026-07-18");
  });

  it("week começa na segunda-feira da semana atual", () => {
    const r = resolvePeriod("week", undefined, reference);
    expect(r.from).toBe("2026-07-13"); // segunda-feira
    expect(r.to).toBe("2026-07-18");
  });

  it("month começa no dia 1 do mês atual", () => {
    const r = resolvePeriod("month", undefined, reference);
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-07-18");
  });

  it("previous_month cobre o mês inteiro anterior", () => {
    const r = resolvePeriod("previous_month", undefined, reference);
    expect(r.from).toBe("2026-06-01");
    expect(r.to).toBe("2026-06-30");
  });

  it("previous_month funciona virando o ano (janeiro -> dezembro do ano anterior)", () => {
    const jan = new Date("2026-01-15T15:00:00.000Z");
    const r = resolvePeriod("previous_month", undefined, jan);
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2025-12-31");
  });

  it("custom respeita from/to informados e normaliza ordem invertida", () => {
    const r = resolvePeriod("custom", { from: "2026-07-20", to: "2026-07-10" });
    expect(r.from).toBe("2026-07-10");
    expect(r.to).toBe("2026-07-20");
  });

  it("custom sem datas válidas cai honestamente em 'hoje', nunca inventa um intervalo", () => {
    const r = resolvePeriod("custom", { from: "", to: "" }, reference);
    expect(r).toEqual({ key: "today", from: "2026-07-18", to: "2026-07-18", label: "Hoje" });
  });

  it("previous_week cobre a semana (segunda a domingo) imediatamente anterior à atual", () => {
    const r = resolvePeriod("previous_week", undefined, reference);
    expect(r.from).toBe("2026-07-06"); // segunda-feira da semana passada
    expect(r.to).toBe("2026-07-12"); // domingo da semana passada
  });

  it("last30days inclui hoje e os 29 dias anteriores", () => {
    const r = resolvePeriod("last30days", undefined, reference);
    expect(r.from).toBe("2026-06-19");
    expect(r.to).toBe("2026-07-18");
  });

  it("last90days inclui hoje e os 89 dias anteriores", () => {
    const r = resolvePeriod("last90days", undefined, reference);
    expect(r.from).toBe("2026-04-20");
    expect(r.to).toBe("2026-07-18");
  });

  it("year começa em 1º de janeiro do ano corrente", () => {
    const r = resolvePeriod("year", undefined, reference);
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-07-18");
  });
});

describe("previousPeriodOf", () => {
  it("período de 1 dia (hoje) -> ontem", () => {
    expect(previousPeriodOf({ from: "2026-07-18", to: "2026-07-18" })).toEqual({ from: "2026-07-17", to: "2026-07-17" });
  });

  it("período de 7 dias -> os 7 dias imediatamente anteriores, mesma duração", () => {
    expect(previousPeriodOf({ from: "2026-07-12", to: "2026-07-18" })).toEqual({ from: "2026-07-05", to: "2026-07-11" });
  });

  it("mês inteiro (31 dias) -> os 31 dias anteriores, sem sobreposição", () => {
    expect(previousPeriodOf({ from: "2026-07-01", to: "2026-07-31" })).toEqual({ from: "2026-05-31", to: "2026-06-30" });
  });
});

describe("comparePeriodValues", () => {
  it("calcula delta e percentual normalmente", () => {
    const c = comparePeriodValues(150, 100);
    expect(c).toEqual({ current: 150, previous: 100, delta: 50, percent: 50 });
  });

  it("queda vira delta e percentual negativos", () => {
    const c = comparePeriodValues(80, 100);
    expect(c.delta).toBe(-20);
    expect(c.percent).toBe(-20);
  });

  it("base anterior zero -> percentual null, nunca Infinity nem inventado", () => {
    const c = comparePeriodValues(50, 0);
    expect(c.delta).toBe(50);
    expect(c.percent).toBeNull();
  });

  it("ambos zero -> delta zero, percentual null", () => {
    const c = comparePeriodValues(0, 0);
    expect(c.delta).toBe(0);
    expect(c.percent).toBeNull();
  });
});

describe("isValidIsoDate", () => {
  it("aceita YYYY-MM-DD", () => {
    expect(isValidIsoDate("2026-07-18")).toBe(true);
  });
  it("rejeita formatos inválidos ou ausentes", () => {
    expect(isValidIsoDate("18/07/2026")).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("parsePeriodParams", () => {
  it("usa 'today' quando period ausente ou desconhecido", () => {
    expect(parsePeriodParams({}).key).toBe("today");
    expect(parsePeriodParams({ period: "invalido" }).key).toBe("today");
  });

  it("resolve period nomeado", () => {
    expect(parsePeriodParams({ period: "yesterday" }).key).toBe("yesterday");
  });

  it("resolve custom com from/to", () => {
    const r = parsePeriodParams({ period: "custom", from: "2026-07-01", to: "2026-07-05" });
    expect(r).toMatchObject({ key: "custom", from: "2026-07-01", to: "2026-07-05" });
  });

  it("resolve specific_month com month/year", () => {
    const r = parsePeriodParams({ period: "specific_month", month: "4", year: "2026" });
    expect(r).toMatchObject({ key: "specific_month", from: "2026-04-01", to: "2026-04-30" });
  });

  it("resolve specific_year com year", () => {
    const r = parsePeriodParams({ period: "specific_year", year: "2026" });
    expect(r.key).toBe("specific_year");
    expect(r.from).toBe("2026-01-01");
  });
});

describe("resolvePeriod — specific_month/specific_year — Missão Financeiro 5C", () => {
  const reference = new Date("2026-09-02T15:00:00.000Z"); // "hoje" = 2026-09-02 em SP

  it("specific_month de um mês passado cobre o mês inteiro (01 ao último dia)", () => {
    const r = resolvePeriod("specific_month", undefined, reference, { month: 4, year: 2026 });
    expect(r.from).toBe("2026-04-01");
    expect(r.to).toBe("2026-04-30");
    expect(r.label).toContain("Abril");
  });

  it("specific_month do mês CORRENTE nunca pede dado do futuro — vai só até hoje", () => {
    const r = resolvePeriod("specific_month", undefined, reference, { month: 9, year: 2026 });
    expect(r.from).toBe("2026-09-01");
    expect(r.to).toBe("2026-09-02"); // hoje, nunca 2026-09-30
  });

  it("specific_month sem mês/ano informado cai no mês corrente", () => {
    const r = resolvePeriod("specific_month", undefined, reference);
    expect(r.from).toBe("2026-09-01");
  });

  it("specific_year de um ano passado cobre o ano inteiro", () => {
    const referenceIn2027 = new Date("2027-03-01T15:00:00.000Z");
    const r = resolvePeriod("specific_year", undefined, referenceIn2027, { year: 2026 });
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-12-31");
  });

  it("specific_year do ano CORRENTE nunca pede dado do futuro — vai só até hoje", () => {
    const r = resolvePeriod("specific_year", undefined, reference, { year: 2026 });
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-09-02");
  });

  it("mês/ano fora do intervalo válido (13, 0, negativo) caem no fallback do mês/ano corrente", () => {
    const r = resolvePeriod("specific_month", undefined, reference, { month: 13, year: -1 });
    expect(r.from).toBe("2026-09-01"); // mês corrente, ano corrente — nunca um mês 13 inventado
  });
});
