import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import EmergenciaPage from "@/app/emergencia/page";
import EmergenciaProtocoloPage from "@/app/emergencia/protocolo/[slug]/page";
import { resetEmergencyRepositoryForTests } from "@/lib/emergency/repository-factory";
import { SEED_CONTACTS } from "@/lib/emergency/seed-data";

/**
 * Módulo Emergência (Fase 1) — render real das páginas (modo memória, conteúdo do seed), como o
 * celular recebe o HTML: ações só para dados existentes, ressalva do seguro sempre presente,
 * protocolo na ordem e nenhuma atualização automática.
 */

beforeEach(() => {
  resetEmergencyRepositoryForTests();
});

async function renderCentral(): Promise<string> {
  return renderToStaticMarkup(await EmergenciaPage());
}

async function renderProtocol(slug: string): Promise<string> {
  return renderToStaticMarkup(await EmergenciaProtocoloPage({ params: Promise.resolve({ slug }) }));
}

function telHrefs(html: string): string[] {
  return [...html.matchAll(/href="(tel:[^"]+)"/g)].map((m) => m[1]);
}

/** HTML com entidades decodificadas o suficiente para comparar texto. */
function text(html: string): string {
  return html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("/emergencia", () => {
  it("cabeçalho e destaque de risco à vida", async () => {
    const html = text(await renderCentral());
    expect(html).toContain("EMERGÊNCIA");
    expect(html).toContain("Central de apoio e procedimentos da Santa Mônica");
    expect(html).toContain("Em risco imediato à vida, priorize os serviços públicos de emergência.");
  });

  it("'O que aconteceu?' com os 12 cards, cada um levando ao seu protocolo, na ordem", async () => {
    const html = await renderCentral();
    expect(html).toContain("O que aconteceu?");
    const links = [...html.matchAll(/href="\/emergencia\/protocolo\/([a-z-]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(["incendio", "dano-veiculo", "roubo-furto", "acidente-pessoa", "alagamento", "energia", "agua-vazamento", "internet", "alarme-seguranca", "carregador-eletrico", "arvore-meio-ambiente", "outra-emergencia"]);
  });

  it("botões LIGAR só para os números conhecidos — nenhum tel: para contato sem telefone", async () => {
    const hrefs = new Set(telHrefs(await renderCentral()));
    expect(hrefs).toEqual(new Set(["tel:190", "tel:192", "tel:193", "tel:199", "tel:08003186546"]));
  });

  it("destaque imediato no topo, antes de 'O que aconteceu?': 190, 192, 193, 199 e Tokio Marine 0800 31 86546", async () => {
    const html = text(await renderCentral());
    const grid = html.indexOf("O que aconteceu?");
    for (const href of ["tel:190", "tel:192", "tel:193", "tel:199", "tel:08003186546"]) {
      const at = html.indexOf(`href="${href}"`);
      expect(at, href).toBeGreaterThan(-1);
      expect(at, href).toBeLessThan(grid);
    }
    expect(html).toContain("SAMU");
    expect(html.indexOf("Apólice 01955436.")).toBeLessThan(grid);
  });

  it("contatos do destaque não se repetem na lista 'Outros contatos'", async () => {
    const html = text(await renderCentral());
    const others = html.slice(html.indexOf("Outros contatos"), html.indexOf("Seguro do estabelecimento"));
    for (const href of ["tel:190", "tel:192", "tel:193", "tel:199", "tel:08003186546"]) expect(others).not.toContain(href);
  });

  it("a seção do seguro mostra a Assistência 24h uma única vez", async () => {
    const html = text(await renderCentral());
    const insurance = html.slice(html.indexOf("Seguro do estabelecimento"));
    expect(insurance.match(/href="tel:08003186546"/g)).toHaveLength(1);
    expect(insurance.match(/0800 31 86546/g)).toHaveLength(1);
  });

  it("nenhum botão WhatsApp/site/e-mail quando o dado não existe", async () => {
    const html = await renderCentral();
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("mailto:");
  });

  it("contatos sem telefone ficam recolhidos numa única linha 'Contatos a cadastrar', sem card e sem botão", async () => {
    const html = text(await renderCentral());
    const withoutPhone = SEED_CONTACTS.filter((c) => c.phone === null);
    expect(html).toContain(`Contatos a cadastrar (${withoutPhone.length})`);
    const pendingBlock = html.slice(html.indexOf("Contatos a cadastrar"));
    for (const contact of withoutPhone) expect(pendingBlock).toContain(contact.name);
    expect(html.match(/<details/g)).toHaveLength(1);
  });

  it("nenhum link quebrado: todo href de ação é tel:, https:// ou rota interna, nunca vazio", async () => {
    const html = await renderCentral();
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^(tel:\+?\d{3,15}|https:\/\/\S+|mailto:\S+@\S+|\/emergencia(\/protocolo\/[a-z-]+)?)$/);
  });

  it("seção de seguro com apólice, vigência, assistência 24h e a ressalva obrigatória antes das coberturas", async () => {
    const html = text(await renderCentral());
    expect(html).toContain("Seguro do estabelecimento");
    expect(html).toContain("Tokio Marine");
    expect(html).toContain("Apólice 01955436");
    expect(html).toContain("14/07/2026 a 14/07/2027");
    expect(html).toContain("Estacionamento e/ou Lava-Rápido");
    expect(html).toContain("Prédio e Conteúdo");
    expect(html).toContain("0800 31 86546");
    const disclaimerAt = html.indexOf("não significa confirmação automática de indenização");
    expect(disclaimerAt).toBeGreaterThan(-1);
    expect(html).toContain("análise da seguradora");
    expect(disclaimerAt).toBeLessThan(html.indexOf("Incêndio e eventos correlatos"));
    expect(html).toContain("RC Garagista — Modalidade Compreensiva");
  });

  it("alvos de toque de pelo menos 48px nos botões de ligar e nos cards", async () => {
    const html = await renderCentral();
    const callAnchors = [...html.matchAll(/<a [^>]*href="tel:[^"]+"[^>]*>/g)].map((m) => m[0]);
    expect(callAnchors.length).toBeGreaterThan(0);
    for (const anchor of callAnchors) expect(anchor).toMatch(/\b(h-12|min-h-12|min-h-14)\b/);
    const cardAnchors = [...html.matchAll(/<a [^>]*href="\/emergencia\/protocolo\/[^"]+"[^>]*>/g)].map((m) => m[0]);
    for (const anchor of cardAnchors) expect(anchor).toMatch(/\bmin-h-28\b/);
  });
});

describe("/emergencia/protocolo/[slug]", () => {
  it("Incêndio: passos numerados na ordem, Bombeiros 193 em destaque, cobertura potencialmente aplicável com ressalva", async () => {
    const html = text(await renderProtocol("incendio"));
    expect(html).toContain("Passo a passo");
    const first = html.indexOf("Se houver risco às pessoas, acione imediatamente o Corpo de Bombeiros — 193.");
    const last = html.indexOf("Não remova ou descarte bens danificados");
    expect(first).toBeGreaterThan(-1);
    expect(last).toBeGreaterThan(first);
    expect(telHrefs(html)).toContain("tel:193");
    expect(html).toContain("Cobertura potencialmente aplicável");
    expect(html).toContain("não significa confirmação automática de indenização");
    expect(html).toContain("Incêndio e eventos correlatos");
  });

  it("Dano/Acidente com veículo: aviso da RC Garagista e cobertura só como potencial", async () => {
    const html = text(await renderProtocol("dano-veiculo"));
    expect(html).toContain("ATENÇÃO: A apólice contém condições específicas para movimentação de veículos");
    expect(html).toContain("Cobertura potencialmente aplicável");
    expect(html).toContain("RC Garagista — Modalidade Compreensiva");
    expect(html).toContain("Não prometa pagamento ou indenização.");
  });

  it("protocolo sem cobertura vinculada não mostra seção de cobertura", async () => {
    const html = text(await renderProtocol("internet"));
    expect(html).not.toContain("Cobertura potencialmente aplicável");
  });

  it("contato prioritário sem telefone não ganha botão quebrado", async () => {
    const html = text(await renderProtocol("energia"));
    expect(html).toContain("Celesc");
    expect(html).toContain("Telefone a cadastrar");
    expect(telHrefs(html).every((href) => ["tel:190", "tel:192", "tel:193", "tel:199"].includes(href))).toBe(true);
  });

  it("Acidente com pessoa: SAMU 192 em destaque como contato prioritário, sem seção de cobertura (vínculo não aprovado)", async () => {
    const html = text(await renderProtocol("acidente-pessoa"));
    const contactSection = html.slice(html.indexOf("Contato prioritário"), html.indexOf("Passo a passo"));
    expect(contactSection).toContain("SAMU");
    expect(contactSection).toContain('href="tel:192"');
    expect(html).toContain("Em emergência médica, acione o SAMU — 192.");
    expect(html).toContain("acione também o Corpo de Bombeiros — 193.");
    expect(html).not.toContain("Cobertura potencialmente aplicável");
  });

  it.each(["alagamento", "energia", "agua-vazamento", "arvore-meio-ambiente", "internet", "alarme-seguranca", "carregador-eletrico", "outra-emergencia"])(
    "%s: sem vínculo automático de cobertura",
    async (slug) => {
      expect(text(await renderProtocol(slug))).not.toContain("Cobertura potencialmente aplicável");
    },
  );

  it("Roubo/Furto: RC Garagista só como potencialmente aplicável, com a ressalva de veículo sob guarda", async () => {
    const html = text(await renderProtocol("roubo-furto"));
    expect(html).toContain("Cobertura potencialmente aplicável");
    expect(html).toContain("veículo de cliente sob guarda");
    expect(html).toContain("não significa confirmação automática de indenização");
  });

  it("protocolo crítico mostra os serviços públicos logo no topo", async () => {
    const html = text(await renderProtocol("acidente-pessoa"));
    expect(html.indexOf("Em risco imediato à vida")).toBeLessThan(html.indexOf("Passo a passo"));
  });

  it("protocolo inexistente -> 404", async () => {
    await expect(renderProtocol("nao-existe")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("responsividade estrutural (~390px)", () => {
  it("títulos com '/' recebem ponto de quebra (<wbr>) nos cards e no título do protocolo", async () => {
    const central = await renderCentral();
    expect(central).toContain("Alagamento/<wbr/>Inundação");
    expect(central).toContain("Vidros/<wbr/>Espelhos/<wbr/>Mármores/<wbr/>Granitos");
    expect(await renderProtocol("alagamento")).toContain("Alagamento/<wbr/>Inundação");
  });

  it("grades começam com no máximo 2 colunas e usam colunas flexíveis (sem largura fixa)", async () => {
    const html = (await renderCentral()) + (await renderProtocol("incendio"));
    const gridClasses = [...html.matchAll(/class="([^"]*\bgrid\b[^"]*)"/g)].map((m) => m[1]);
    expect(gridClasses.length).toBeGreaterThan(0);
    for (const cls of gridClasses) expect(cls, cls).toMatch(/(^|\s)grid-cols-[12](\s|$)/);
  });

  it("números de telefone nunca quebram no meio", async () => {
    const html = await renderCentral();
    const numberSpans = [...html.matchAll(/<span class="([^"]*tabular-nums[^"]*)">(0800 31 86546|19\d)<\/span>/g)];
    expect(numberSpans.length).toBeGreaterThanOrEqual(5);
    for (const [, cls] of numberSpans) expect(cls).toContain("whitespace-nowrap");
  });
});

describe("sem polling / sem atualização automática", () => {
  const roots = ["src/app/emergencia", "src/components/emergency", "src/lib/emergency", "src/app/configuracoes/emergencia"];
  const repoRoot = path.resolve(__dirname, "../../..");
  function walk(dir: string): string[] {
    const abs = path.join(repoRoot, dir);
    return readdirSync(abs).flatMap((entry) => (statSync(path.join(abs, entry)).isDirectory() ? walk(path.join(dir, entry)) : /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") ? [path.join(abs, entry)] : []));
  }
  const files = roots.flatMap((dir) => walk(dir));

  it.each(["setInterval", "setTimeout", "router.refresh", "AutoRefresh", "useEffect"])("nenhum arquivo do módulo usa %s", (term) => {
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(readFileSync(file, "utf-8"), path.relative(repoRoot, file)).not.toContain(term);
  });
});
