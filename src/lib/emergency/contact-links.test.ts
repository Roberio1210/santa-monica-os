import { describe, expect, it } from "vitest";
import { buildContactActions, toMailtoHref, toTelHref, toWebsiteHref, toWhatsappHref } from "@/lib/emergency/contact-links";

/** Módulo Emergência (Fase 1) — nunca renderizar ação quebrada para dado inexistente ou inválido. */

const EMPTY = { phone: null, phoneAlt: null, whatsapp: null, website: null, email: null };

describe("toTelHref", () => {
  it("números públicos curtos viram tel: válido", () => {
    expect(toTelHref("190")).toBe("tel:190");
    expect(toTelHref("193")).toBe("tel:193");
    expect(toTelHref("199")).toBe("tel:199");
  });

  it("0800 com espaços vira tel: só com dígitos", () => {
    expect(toTelHref("0800 31 86546")).toBe("tel:08003186546");
  });

  it("fixo/celular formatado e número internacional", () => {
    expect(toTelHref("(48) 3333-0000")).toBe("tel:4833330000");
    expect(toTelHref("+55 48 99999-0000")).toBe("tel:+5548999990000");
  });

  it("vazio, nulo, texto sem dígitos suficientes ou longo demais -> null", () => {
    expect(toTelHref(null)).toBeNull();
    expect(toTelHref(undefined)).toBeNull();
    expect(toTelHref("")).toBeNull();
    expect(toTelHref("   ")).toBeNull();
    expect(toTelHref("sem número")).toBeNull();
    expect(toTelHref("12")).toBeNull();
    expect(toTelHref("1234567890123456")).toBeNull();
  });
});

describe("toWhatsappHref", () => {
  it("celular brasileiro com DDD recebe o 55", () => {
    expect(toWhatsappHref("(48) 99174-1102")).toBe("https://wa.me/5548991741102");
  });

  it("número já com DDI é mantido", () => {
    expect(toWhatsappHref("+55 48 99174-1102")).toBe("https://wa.me/5548991741102");
  });

  it("números curtos, 0800 e vazios nunca viram WhatsApp", () => {
    expect(toWhatsappHref("190")).toBeNull();
    expect(toWhatsappHref("0800 31 86546")).toBeNull();
    expect(toWhatsappHref(null)).toBeNull();
    expect(toWhatsappHref("")).toBeNull();
  });
});

describe("toWebsiteHref / toMailtoHref", () => {
  it("site com ou sem esquema; só http/https", () => {
    expect(toWebsiteHref("esteticastamonica.com.br")).toBe("https://esteticastamonica.com.br/");
    expect(toWebsiteHref("https://www.exemplo.com.br/contato")).toBe("https://www.exemplo.com.br/contato");
    expect(toWebsiteHref("javascript:alert(1)")).toBeNull();
    expect(toWebsiteHref("ftp://exemplo.com")).toBeNull();
    expect(toWebsiteHref("localhost")).toBeNull();
    expect(toWebsiteHref(null)).toBeNull();
  });

  it("e-mail precisa ter formato válido", () => {
    expect(toMailtoHref("contato@exemplo.com.br")).toBe("mailto:contato@exemplo.com.br");
    expect(toMailtoHref("sem-arroba")).toBeNull();
    expect(toMailtoHref(null)).toBeNull();
  });
});

describe("buildContactActions", () => {
  it("contato sem nenhum dado -> nenhuma ação (nenhum botão renderizado)", () => {
    expect(buildContactActions(EMPTY)).toEqual([]);
  });

  it("só telefone -> só Ligar", () => {
    expect(buildContactActions({ ...EMPTY, phone: "193" })).toEqual([{ kind: "ligar", label: "Ligar", href: "tel:193" }]);
  });

  it("ordem: Ligar, alternativo, WhatsApp, Site, E-mail — e só os válidos", () => {
    const actions = buildContactActions({ phone: "(48) 3333-0000", phoneAlt: "(48) 3333-1111", whatsapp: "48 99999-0000", website: "exemplo.com.br", email: "a@exemplo.com" });
    expect(actions.map((a) => a.kind)).toEqual(["ligar", "ligar_alternativo", "whatsapp", "site", "email"]);
  });

  it("dado inválido é omitido (nunca link quebrado)", () => {
    const actions = buildContactActions({ ...EMPTY, phone: "abc", whatsapp: "190", website: "javascript:x", email: "x" });
    expect(actions).toEqual([]);
  });

  it("telefone alternativo igual ao principal não duplica o botão", () => {
    expect(buildContactActions({ ...EMPTY, phone: "193", phoneAlt: "193" })).toHaveLength(1);
  });
});
