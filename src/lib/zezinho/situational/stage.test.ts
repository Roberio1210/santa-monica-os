import { describe, expect, it } from "vitest";
import { computeSituationalContext } from "@/lib/zezinho/situational/stage";

/** Datas de referência em UTC — São Paulo é UTC-3 o ano todo (sem horário de verão desde 2019). */
function at(dateIso: string, hm: string): Date {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const [h, m] = hm.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m, 0));
}

describe("computeSituationalContext — exemplo obrigatório do pedido", () => {
  it("segunda-feira 08:10 -> lavação em abertura, amostra insuficiente (nunca 'caiu 100%')", () => {
    const ctx = computeSituationalContext(at("2026-07-20", "08:10")); // 2026-07-20 é segunda-feira
    expect(ctx.weekdayLabel).toBe("segunda-feira");
    expect(ctx.areas.lavacao.isOpen).toBe(true);
    expect(ctx.areas.lavacao.stage).toBe("abertura");
    expect(ctx.areas.lavacao.sampleConfidence).toBe("insuficiente");
    expect(ctx.areas.lavacao.minutesSinceOpen).toBe(10);
  });
});

describe("computeSituationalContext — lavação (seg-sex 8-18h, sáb 8-12h, dom fechado)", () => {
  it("domingo -> fechado o dia inteiro", () => {
    const ctx = computeSituationalContext(at("2026-07-19", "14:00")); // domingo
    expect(ctx.areas.lavacao.isOpen).toBe(false);
    expect(ctx.areas.lavacao.stage).toBe("fechado");
    expect(ctx.areas.lavacao.sampleConfidence).toBe("indisponivel");
  });

  it("segunda 07:30 -> pré-abertura", () => {
    const ctx = computeSituationalContext(at("2026-07-20", "07:30"));
    expect(ctx.areas.lavacao.isOpen).toBe(false);
    expect(ctx.areas.lavacao.stage).toBe("pre_abertura");
  });

  it("segunda 12:00 -> meio do expediente, amostra parcial", () => {
    const ctx = computeSituationalContext(at("2026-07-20", "12:00"));
    expect(ctx.areas.lavacao.stage).toBe("meio_expediente");
    expect(ctx.areas.lavacao.sampleConfidence).toBe("parcial");
  });

  it("segunda 17:30 -> fechamento (última hora)", () => {
    const ctx = computeSituationalContext(at("2026-07-20", "17:30"));
    expect(ctx.areas.lavacao.stage).toBe("fechamento");
    expect(ctx.areas.lavacao.minutesUntilClose).toBe(30);
  });

  it("segunda 18:00 -> já fechado, amostra completa", () => {
    const ctx = computeSituationalContext(at("2026-07-20", "18:00"));
    expect(ctx.areas.lavacao.isOpen).toBe(false);
    expect(ctx.areas.lavacao.stage).toBe("fechado");
    expect(ctx.areas.lavacao.sampleConfidence).toBe("completa");
  });

  it("sábado 11:00 -> aberto (fecha 12h aos sábados)", () => {
    const ctx = computeSituationalContext(at("2026-07-25", "11:00")); // sábado
    expect(ctx.areas.lavacao.isOpen).toBe(true);
    expect(ctx.areas.lavacao.minutesUntilClose).toBe(60);
  });

  it("sábado 13:00 -> fechado (fechou às 12h)", () => {
    const ctx = computeSituationalContext(at("2026-07-25", "13:00"));
    expect(ctx.areas.lavacao.isOpen).toBe(false);
  });
});

describe("computeSituationalContext — estacionamento (horários variam por dia, alguns até meia-noite)", () => {
  it("domingo 10:00 -> pré-abertura (abre só 12h aos domingos)", () => {
    const ctx = computeSituationalContext(at("2026-07-19", "10:00"));
    expect(ctx.areas.estacionamento.stage).toBe("pre_abertura");
  });

  it("domingo 20:00 -> aberto (fecha 22h aos domingos)", () => {
    const ctx = computeSituationalContext(at("2026-07-19", "20:00"));
    expect(ctx.areas.estacionamento.isOpen).toBe(true);
  });

  it("terça 21:00 -> fechamento (fecha 22h às terças)", () => {
    const ctx = computeSituationalContext(at("2026-07-21", "21:00")); // terça
    expect(ctx.areas.estacionamento.stage).toBe("fechamento");
  });

  it("terça 22:30 -> fechado", () => {
    const ctx = computeSituationalContext(at("2026-07-21", "22:30"));
    expect(ctx.areas.estacionamento.isOpen).toBe(false);
  });

  it("quarta 23:00 -> ainda aberto (fecha só à meia-noite de quarta a sábado)", () => {
    const ctx = computeSituationalContext(at("2026-07-22", "23:00")); // quarta
    expect(ctx.areas.estacionamento.isOpen).toBe(true);
    expect(ctx.areas.estacionamento.stage).toBe("fechamento");
  });

  it("lavação e estacionamento têm estágios independentes no mesmo instante (segunda 08:10)", () => {
    const ctx = computeSituationalContext(at("2026-07-20", "08:10"));
    expect(ctx.areas.lavacao.stage).toBe("abertura");
    expect(ctx.areas.estacionamento.stage).toBe("abertura");
    // mesmo horário de abertura hoje (segunda, ambos 08:00) — mas em outro dia (ex. terça) seriam iguais só por coincidência.
  });
});
