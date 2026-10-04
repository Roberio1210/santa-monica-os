import { describe, expect, it } from "vitest";
import { formatStepsText, MAX_STEPS, parseStepsText, validateContactInput, validateProtocolInput, type RawContactForm, type RawProtocolForm } from "@/lib/emergency/validation";

const CONTACT: RawContactForm = {
  name: "Celesc",
  category: "concessionaria",
  phone: "",
  phoneAlt: "",
  whatsapp: "",
  email: "",
  website: "",
  priority: "normal",
  displayOrder: "90",
  notes: "",
};

const PROTOCOL: RawProtocolForm = {
  title: "Energia elétrica",
  category: "servico_essencial",
  description: "Falta de energia.",
  priority: "normal",
  displayOrder: "60",
  warning: "",
  notes: "",
  priorityContactId: "",
  potentialCoverageKeys: ["danos_eletricos"],
  steps: "! Afaste as pessoas\nIdentifique o problema\n\n  Registre o protocolo  ",
};

describe("validateContactInput", () => {
  it("contato sem telefone é válido (cadastro pendente) e campos vazios viram null", () => {
    const result = validateContactInput(CONTACT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ name: "Celesc", phone: null, whatsapp: null, website: null, email: null, notes: null, displayOrder: 90 });
    }
  });

  it("nome obrigatório, categoria e prioridade só da lista permitida", () => {
    expect(validateContactInput({ ...CONTACT, name: "  " }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, category: "hacker" }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, priority: "urgentissima" }).ok).toBe(false);
  });

  it("valor preenchido que não vira link válido é recusado (nunca gravado para depois sumir da tela)", () => {
    expect(validateContactInput({ ...CONTACT, phone: "abc" }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, whatsapp: "190" }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, website: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, email: "sem-arroba" }).ok).toBe(false);
  });

  it("ordem de exibição precisa ser inteiro não negativo", () => {
    expect(validateContactInput({ ...CONTACT, displayOrder: "-1" }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, displayOrder: "1.5" }).ok).toBe(false);
    expect(validateContactInput({ ...CONTACT, displayOrder: "" }).ok).toBe(true);
  });
});

describe("parseStepsText / formatStepsText", () => {
  it("um passo por linha, na ordem; '!' marca crítico; linhas vazias ignoradas", () => {
    const result = parseStepsText(String(PROTOCOL.steps));
    expect(result).toEqual({
      ok: true,
      value: [
        { text: "Afaste as pessoas", isCritical: true },
        { text: "Identifique o problema", isCritical: false },
        { text: "Registre o protocolo", isCritical: false },
      ],
    });
  });

  it("ida e volta preserva texto, ordem e criticidade", () => {
    const steps = [
      { text: "Primeiro", isCritical: true },
      { text: "Segundo", isCritical: false },
    ];
    expect(parseStepsText(formatStepsText(steps))).toEqual({ ok: true, value: steps });
  });

  it("sem nenhum passo, ou acima do limite, é recusado", () => {
    expect(parseStepsText("\n \n").ok).toBe(false);
    expect(parseStepsText(Array.from({ length: MAX_STEPS + 1 }, (_, i) => `Passo ${i}`).join("\n")).ok).toBe(false);
  });
});

describe("validateProtocolInput", () => {
  it("protocolo válido", () => {
    const result = validateProtocolInput(PROTOCOL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps).toHaveLength(3);
      expect(result.value.potentialCoverageKeys).toEqual(["danos_eletricos"]);
      expect(result.value.priorityContactId).toBeNull();
    }
  });

  it("cobertura desconhecida é recusada — nunca inventa cobertura", () => {
    expect(validateProtocolInput({ ...PROTOCOL, potentialCoverageKeys: ["cobertura_inventada"] }).ok).toBe(false);
  });

  it("coberturas repetidas são deduplicadas", () => {
    const result = validateProtocolInput({ ...PROTOCOL, potentialCoverageKeys: ["danos_eletricos", "danos_eletricos"] });
    expect(result.ok && result.value.potentialCoverageKeys).toEqual(["danos_eletricos"]);
  });

  it("título, descrição e categoria válidos são obrigatórios", () => {
    expect(validateProtocolInput({ ...PROTOCOL, title: "" }).ok).toBe(false);
    expect(validateProtocolInput({ ...PROTOCOL, description: "" }).ok).toBe(false);
    expect(validateProtocolInput({ ...PROTOCOL, category: "qualquer" }).ok).toBe(false);
  });
});
