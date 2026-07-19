import { describe, expect, it } from "vitest";
import { addDaysIso, isValidIsoDate, parsePeriodParams, resolvePeriod, saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";

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
});
