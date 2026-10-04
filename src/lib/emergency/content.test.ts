import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_CONTACTS, SEED_PROTOCOLS } from "@/lib/emergency/seed-data";
import { computePolicyValidity, INSURANCE_COVERAGES, INSURANCE_DISCLAIMER, INSURANCE_POLICY, isKnownCoverageKey, POTENTIAL_COVERAGE_LABEL, resolveCoverages } from "@/lib/emergency/insurance";

/**
 * Módulo Emergência (Fase 1) — conteúdo da Central conferido contra a missão: nenhum telefone
 * inventado, protocolos na ordem pedida, valores da apólice literais e nenhuma linguagem que
 * afirme cobertura/indenização.
 */

/** Únicos números fornecidos explicitamente pelo gestor na missão. */
const ALLOWED_PHONES = new Set(["190", "192", "193", "199", "0800 31 86546"]);

/**
 * As 4 expressões vetadas na missão + variações com o mesmo sentido (afirmar cobertura, prometer
 * pagamento/indenização, autorizar reparo). Nenhuma pode aparecer, nem em contexto afirmativo nem
 * citada — o conteúdo do módulo só usa formas negativas ("Não prometa", "Não autorize reparo").
 */
const FORBIDDEN_PHRASES = [
  "está coberto",
  "seguro vai pagar",
  "pode consertar",
  "será indenizado",
  "está coberta",
  "cobertura garantida",
  "cobertura confirmada",
  "seguro paga",
  "seguradora vai pagar",
  "seguradora pagará",
  "seguro pagará",
  "vamos pagar",
  "será reembolsado",
  "reparo autorizado",
  "pode reparar",
  "pode mandar consertar",
];

/** Vínculos protocolo → cobertura aprovados explicitamente pelo gestor (Missão 2.1). Qualquer outro é inferência e é proibido. */
const APPROVED_COVERAGE_LINKS: Record<string, string[]> = {
  incendio: ["incendio"],
  "dano-veiculo": ["rc_garagista"],
  "roubo-furto": ["rc_garagista"],
};

const REPO_ROOT = path.resolve(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  const absolute = path.join(REPO_ROOT, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) return sourceFiles(path.join(dir, entry));
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.ts$/.test(entry) ? [full] : [];
  });
}

/** Todo o código do módulo (conteúdo, componentes, páginas, seed) — a varredura de frases proibidas cobre tudo que pode chegar à tela. */
const MODULE_SOURCES = [
  ...sourceFiles("src/lib/emergency"),
  ...sourceFiles("src/components/emergency"),
  ...sourceFiles("src/app/emergencia"),
  ...sourceFiles("src/app/configuracoes/emergencia"),
  path.join(REPO_ROOT, "src/db/seed/emergency-foundation.ts"),
];

describe("contatos iniciais", () => {
  it("nenhum telefone inventado — só 190, 193, 199 e a assistência 24h da Tokio Marine", () => {
    const phones = SEED_CONTACTS.map((c) => c.phone).filter((p): p is string => p !== null);
    expect(new Set(phones)).toEqual(ALLOWED_PHONES);
  });

  it("serviços públicos com os números fornecidos", () => {
    const byKey = new Map(SEED_CONTACTS.map((c) => [c.key, c]));
    expect(byKey.get("policia-militar")).toMatchObject({ name: "Polícia Militar", phone: "190", category: "servico_publico" });
    expect(byKey.get("bombeiros")).toMatchObject({ name: "Corpo de Bombeiros", phone: "193", category: "servico_publico" });
    expect(byKey.get("defesa-civil")).toMatchObject({ name: "Defesa Civil", phone: "199", category: "servico_publico" });
    expect(byKey.get("samu")).toMatchObject({ name: "SAMU", phone: "192", category: "servico_publico", priority: "critica" });
    expect(byKey.get("tokio-marine-assistencia")).toMatchObject({ name: "Tokio Marine — Assistência 24h", phone: "0800 31 86546", category: "seguro", priority: "critica" });
    expect(byKey.get("tokio-marine-assistencia")?.notes).toContain("01955436");
  });

  it("todos os contatos pedidos existem, os sem dado confirmado ficam sem telefone", () => {
    const names = SEED_CONTACTS.map((c) => c.name);
    for (const expected of ["Verisure", "Celesc", "CASAN", "Vivo Empresas", "WeCharge", "Guarda Municipal de Florianópolis", "FLORAM", "Prefeitura de Florianópolis", "Corretor do seguro", "Proprietário/Administrador", "Gerente", "Contabilidade", "Advogado"]) {
      expect(names).toContain(expected);
      expect(SEED_CONTACTS.find((c) => c.name === expected)?.phone).toBeNull();
    }
  });

  it("chaves e ordens de exibição únicas", () => {
    expect(new Set(SEED_CONTACTS.map((c) => c.key)).size).toBe(SEED_CONTACTS.length);
    expect(new Set(SEED_CONTACTS.map((c) => c.displayOrder)).size).toBe(SEED_CONTACTS.length);
  });
});

describe("protocolos iniciais", () => {
  it("os 12 tipos de 'O que aconteceu?', na ordem pedida", () => {
    const ordered = [...SEED_PROTOCOLS].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => p.title);
    expect(ordered).toEqual([
      "Incêndio",
      "Dano/Acidente com veículo",
      "Roubo/Furto",
      "Acidente com pessoa",
      "Alagamento/Inundação",
      "Energia elétrica",
      "Água/Vazamento",
      "Internet",
      "Alarme/Segurança",
      "Carregador elétrico",
      "Árvore/Meio ambiente",
      "Outra emergência",
    ]);
  });

  it("slugs únicos, todo protocolo tem passos, contato prioritário e coberturas existem", () => {
    expect(new Set(SEED_PROTOCOLS.map((p) => p.slug)).size).toBe(SEED_PROTOCOLS.length);
    const contactKeys = new Set(SEED_CONTACTS.map((c) => c.key));
    for (const protocol of SEED_PROTOCOLS) {
      expect(protocol.steps.length).toBeGreaterThan(0);
      if (protocol.priorityContactKey) expect(contactKeys.has(protocol.priorityContactKey)).toBe(true);
      for (const key of protocol.potentialCoverageKeys) expect(isKnownCoverageKey(key)).toBe(true);
    }
  });

  it("Incêndio: prioridade crítica, 10 passos literais na ordem, Bombeiros como contato e cobertura de incêndio", () => {
    const incendio = SEED_PROTOCOLS.find((p) => p.slug === "incendio")!;
    expect(incendio.priority).toBe("critica");
    expect(incendio.priorityContactKey).toBe("bombeiros");
    expect(incendio.potentialCoverageKeys).toEqual(["incendio"]);
    expect(incendio.steps.map((s) => s.text)).toEqual([
      "Se houver risco às pessoas, acione imediatamente o Corpo de Bombeiros — 193.",
      "Evacue clientes e equipe para local seguro.",
      "Não coloque ninguém em risco para salvar veículos, equipamentos ou objetos.",
      "Quando seguro, identifique a área atingida.",
      "Avise o responsável pela Santa Mônica.",
      "Preserve imagens das câmeras e demais evidências, quando possível e seguro.",
      "Identifique os veículos que estavam no estabelecimento.",
      "Acione a seguradora/corretor quando aplicável.",
      "Registre protocolos externos.",
      "Não remova ou descarte bens danificados sem necessidade de segurança ou orientação adequada.",
    ]);
  });

  it("Dano/Acidente com veículo: 14 passos, RC Garagista e o aviso de movimentação/exclusões", () => {
    const dano = SEED_PROTOCOLS.find((p) => p.slug === "dano-veiculo")!;
    expect(dano.steps).toHaveLength(14);
    expect(dano.steps[0].text).toBe("Verifique primeiro se alguém se feriu.");
    expect(dano.steps[13].text).toBe("Guarde todos os protocolos e documentos.");
    expect(dano.potentialCoverageKeys).toEqual(["rc_garagista"]);
    expect(dano.warning).toContain("condições específicas para movimentação de veículos");
    expect(dano.warning).toContain("execução insuficiente ou defeituosa do próprio serviço");
    expect(dano.warning).toContain("Não confirmar cobertura ao cliente antes da análise da seguradora.");
  });

  it("Roubo/Furto: não confrontar, PM 190, preservar câmeras", () => {
    const roubo = SEED_PROTOCOLS.find((p) => p.slug === "roubo-furto")!;
    const text = roubo.steps.map((s) => s.text).join(" ");
    expect(text).toContain("Não confronte suspeitos");
    expect(text).toContain("190");
    expect(text).toContain("câmeras");
  });

  it("vínculos de cobertura SÓ os aprovados: Incêndio, Dano/Acidente com veículo e Roubo/Furto — nenhum outro", () => {
    const links = Object.fromEntries(SEED_PROTOCOLS.filter((p) => p.potentialCoverageKeys.length > 0).map((p) => [p.slug, p.potentialCoverageKeys]));
    expect(links).toEqual(APPROVED_COVERAGE_LINKS);
  });

  it("Roubo/Furto: RC Garagista restrita a veículo de cliente sob guarda, com ressalva das condições", () => {
    const roubo = SEED_PROTOCOLS.find((p) => p.slug === "roubo-furto")!;
    expect(roubo.warning).toContain("cobertura potencialmente aplicável");
    expect(roubo.warning).toContain("veículo de cliente sob guarda");
    expect(roubo.warning).toContain("observadas as condições específicas da apólice");
    expect(roubo.warning).toContain("Para bens do próprio estabelecimento não há vínculo automático");
  });

  it("Acidente com pessoa: segurança do local, SAMU 192 e Bombeiros 193 nos primeiros passos, SAMU como contato prioritário", () => {
    const acidente = SEED_PROTOCOLS.find((p) => p.slug === "acidente-pessoa")!;
    expect(acidente.priorityContactKey).toBe("samu");
    expect(acidente.steps.slice(0, 3).map((s) => s.text)).toEqual([
      "Avalie se o local está seguro para você e para a pessoa (veículos em movimento, fogo, eletricidade).",
      "Em emergência médica, acione o SAMU — 192.",
      "Havendo fogo, fumaça, pessoa presa ou risco no local, acione também o Corpo de Bombeiros — 193.",
    ]);
    expect(acidente.steps.slice(0, 3).every((s) => s.isCritical)).toBe(true);
  });

  it("Acidente com pessoa: não movimentar ferido grave e registrar testemunhas — sem orientação médica", () => {
    const acidente = SEED_PROTOCOLS.find((p) => p.slug === "acidente-pessoa")!;
    const text = acidente.steps.map((s) => s.text).join(" ");
    expect(text).toContain("Não movimente pessoa gravemente ferida");
    expect(text).toContain("testemunhas");
    expect(acidente.description).toContain("não substitui orientação médica");
  });
});

describe("seguro — resumo da apólice", () => {
  it("dados da apólice literais", () => {
    expect(INSURANCE_POLICY).toMatchObject({
      insurer: "Tokio Marine",
      policyNumber: "01955436",
      startDate: "2026-07-14",
      endDate: "2027-07-14",
      declaredActivity: "Estacionamento e/ou Lava-Rápido",
      coveredAssets: "Prédio e Conteúdo",
      assistancePhone: "0800 31 86546",
    });
  });

  it("13 coberturas com LMI e participação exatamente como fornecidos", () => {
    const summary = INSURANCE_COVERAGES.map((c) => [c.name, c.lmi, c.participation?.percent ?? null, c.participation?.minimum ?? null, c.indemnityPeriodMonths, c.condition]);
    expect(summary).toEqual([
      ["Incêndio e eventos correlatos", 200_000, 10, 3_000, null, null],
      ["Alagamento/Inundação", 10_000, 20, 5_000, null, null],
      ["Anúncios Luminosos", 10_000, 10, 600, null, null],
      ["Danos Elétricos", 30_000, 10, 3_500, null, null],
      ["Equipamentos Eletrônicos", 30_000, 10, 600, null, null],
      ["Impacto de Veículos", 100_000, 10, 750, null, null],
      ["Vidros/Espelhos/Mármores/Granitos", 5_000, 10, 300, null, null],
      ["RC Garagista — Modalidade Compreensiva", 20_000, 10, 1_800, null, null],
      ["RC Operações", 100_000, 10, 500, null, null],
      ["Danos Morais — RC Operações", 20_000, 10, 500, null, null],
      ["Derrame/Vazamento de Tanques e Tubulações", 10_000, 20, 3_000, null, null],
      ["Despesas de Aluguel", 15_000, null, null, 6, null],
      ["Lucros Cessantes / Despesas Fixas", 10_000, null, null, 6, "Primeiros 5 dias"],
    ]);
  });

  it("disclaimer obrigatório com a redação fornecida e rótulo 'Cobertura potencialmente aplicável'", () => {
    const text = INSURANCE_DISCLAIMER.join(" ");
    expect(text).toContain("Os dados abaixo são um resumo operacional da apólice.");
    expect(text).toContain("A existência de uma cobertura nesta tela não significa confirmação automática de indenização.");
    expect(text).toContain("A aplicação da cobertura depende das circunstâncias do evento, condições contratuais, exclusões, documentação apresentada e análise da seguradora.");
    expect(POTENTIAL_COVERAGE_LABEL).toBe("Cobertura potencialmente aplicável");
  });

  it("resolveCoverages ignora chave desconhecida (nunca inventa cobertura)", () => {
    expect(resolveCoverages(["incendio", "nao_existe"]).map((c) => c.key)).toEqual(["incendio"]);
  });

  it("vigência: a iniciar / vigente (bordas inclusivas) / vencida", () => {
    expect(computePolicyValidity("2026-07-13")).toBe("a_iniciar");
    expect(computePolicyValidity("2026-07-14")).toBe("vigente");
    expect(computePolicyValidity("2026-10-04")).toBe("vigente");
    expect(computePolicyValidity("2027-07-14")).toBe("vigente");
    expect(computePolicyValidity("2027-07-15")).toBe("vencida");
  });
});

describe("linguagem proibida", () => {
  it.each(FORBIDDEN_PHRASES)("'%s' não aparece em nenhum conteúdo de protocolo, contato ou seguro", (phrase) => {
    const content = JSON.stringify({ SEED_CONTACTS, SEED_PROTOCOLS, INSURANCE_POLICY, INSURANCE_COVERAGES, INSURANCE_DISCLAIMER }).toLowerCase();
    expect(content).not.toContain(phrase);
  });

  it.each(FORBIDDEN_PHRASES)("'%s' não aparece em nenhum arquivo do módulo (componentes, páginas, seed)", (phrase) => {
    expect(MODULE_SOURCES.length).toBeGreaterThan(10);
    for (const file of MODULE_SOURCES) {
      expect(readFileSync(file, "utf-8").toLowerCase(), path.relative(REPO_ROOT, file)).not.toContain(phrase);
    }
  });
});

describe("responsividade estrutural — código do módulo", () => {
  /** Larguras fixas que estourariam ~390px (a largura útil do conteúdo é ~358px com o padding do AppShell). */
  it("nenhuma largura fixa em px/rem acima de 20rem nem w-screen em componentes e páginas do módulo", () => {
    const uiFiles = MODULE_SOURCES.filter((f) => f.endsWith(".tsx"));
    expect(uiFiles.length).toBeGreaterThan(5);
    for (const file of uiFiles) {
      const source = readFileSync(file, "utf-8");
      const rel = path.relative(REPO_ROOT, file);
      expect(source, rel).not.toMatch(/\b(min-)?w-\[\d+px\]/);
      expect(source, rel).not.toMatch(/\bw-screen\b/);
      for (const match of source.matchAll(/\b(?:min-)?w-\[(\d+(?:\.\d+)?)rem\]/g)) expect(Number(match[1]), rel).toBeLessThanOrEqual(20);
      expect(source, rel).not.toMatch(/\bw-(72|80|96)\b/);
    }
  });
});
