import { describe, expect, it } from "vitest";
import { APPROVED_TEMPLATES, findApprovedTemplate, resolveMessageWindow } from "@/lib/integrations/whatsapp/templates";

/** Missão Z6.2 (seção 15) — nenhum template inventado; janela de 24h calculada corretamente. */
describe("APPROVED_TEMPLATES / findApprovedTemplate", () => {
  it("começa vazio — nenhum template foi inventado ou pré-cadastrado nesta missão", () => {
    expect(APPROVED_TEMPLATES).toEqual([]);
  });

  it("findApprovedTemplate nunca encontra nada enquanto o registro estiver vazio", () => {
    expect(findApprovedTemplate("pos_venda")).toBeNull();
    expect(findApprovedTemplate("qualquer")).toBeNull();
  });
});

describe("resolveMessageWindow", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("sem nenhuma mensagem recebida antes (null) -> sempre requer template", () => {
    expect(resolveMessageWindow(null, now)).toBe("requer_template");
  });

  it("última mensagem recebida há 1 hora -> dentro da janela de sessão", () => {
    const lastInboundAt = new Date("2026-08-24T11:00:00.000Z");
    expect(resolveMessageWindow(lastInboundAt, now)).toBe("sessao");
  });

  it("última mensagem recebida exatamente há 24h -> ainda dentro da janela (limite inclusivo)", () => {
    const lastInboundAt = new Date("2026-08-23T12:00:00.000Z");
    expect(resolveMessageWindow(lastInboundAt, now)).toBe("sessao");
  });

  it("última mensagem recebida há mais de 24h -> requer template", () => {
    const lastInboundAt = new Date("2026-08-23T11:59:00.000Z");
    expect(resolveMessageWindow(lastInboundAt, now)).toBe("requer_template");
  });
});
