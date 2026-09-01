import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_MODULES, resolveActiveModuleId, resolveModuleLinkHref } from "@/components/navigation/app-modules";

/**
 * Missão UX/Navegação 3 — as 48 rotas que tinham item próprio na lateral ANTES desta missão
 * (histórico de `nav-items.ts`, removido por ficar sem nenhum importador). Cada uma precisa
 * continuar alcançável a partir de algum módulo — via `href` do próprio módulo, `matchPrefixes`
 * ou `shortcuts` — nunca simplesmente desaparecer da navegação.
 */
const OLD_NAV_ROUTES = [
  "/dashboard",
  "/atendimento",
  "/operacao",
  "/assistente-gerente",
  "/planejamento",
  "/crm",
  "/painel-gerencial",
  "/ordens",
  "/movimentacoes",
  "/lavacao",
  "/estacionamento",
  "/agenda",
  "/financeiro",
  "/financeiro/fluxo-de-caixa",
  "/financeiro/contas-a-receber",
  "/financeiro/contas-a-pagar",
  "/financeiro/despesas",
  "/financeiro/fornecedores",
  "/financeiro/dre",
  "/financeiro/classificacao",
  "/financeiro/fechamento",
  "/financeiro/stone-conciliacao",
  "/financeiro/conta-stone",
  "/alertas",
  "/marketing",
  "/estoque",
  "/estoque/posicao",
  "/estoque/produtos",
  "/estoque/compras",
  "/estoque/entradas",
  "/estoque/saidas",
  "/estoque/movimentacoes",
  "/estoque/contagem",
  "/estoque/receitas",
  "/estoque/calibracao",
  "/estoque/mapeamentos",
  "/estoque/mapeamentos-servicos",
  "/estoque/consumo-teorico-historico",
  "/estoque/ordens",
  "/estoque/consumo-automatico",
  "/estoque/consumos",
  "/estoque/pendencias",
  "/estoque/compras-sugeridas",
  "/estoque/auditoria",
  "/compras",
  "/seguranca",
  "/zezinho",
  "/configuracoes",
];

/** Mesma lógica de correspondência usada por `resolveActiveModuleId`, mas testando cobertura (não só a primeira ocorrência). */
function isRouteReachableFromSomeModule(route: string): boolean {
  return APP_MODULES.some(
    (m) =>
      route === m.href ||
      route.startsWith(`${m.href}/`) ||
      m.matchPrefixes.some((p) => route === p || route.startsWith(`${p}/`)) ||
      m.shortcuts.some((s) => route === s.href || route.startsWith(`${s.href}/`)),
  );
}

describe("APP_MODULES — Missão UX/Navegação 3", () => {
  it("1) o menu principal tem por volta de 9 módulos (nunca a lista antiga de 48 itens)", () => {
    expect(APP_MODULES.length).toBeGreaterThanOrEqual(8);
    expect(APP_MODULES.length).toBeLessThanOrEqual(10);
  });

  it("2) cada módulo tem um id/label/href únicos — nunca duas entradas colidindo na lateral", () => {
    const ids = APP_MODULES.map((m) => m.id);
    const hrefs = APP_MODULES.map((m) => m.href);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("3/7) nenhuma das 48 rotas antigas ficou órfã — todas continuam alcançáveis a partir de algum módulo", () => {
    const orphaned = OLD_NAV_ROUTES.filter((route) => !isRouteReachableFromSomeModule(route));
    expect(orphaned).toEqual([]);
  });

  it("4) nenhuma página das rotas antigas foi apagada do filesystem (build continua servindo todas)", () => {
    const appDir = join(process.cwd(), "src/app");
    const missing = OLD_NAV_ROUTES.filter((route) => {
      const dir = route === "/" ? appDir : join(appDir, route.slice(1));
      return !existsSync(join(dir, "page.tsx"));
    });
    expect(missing).toEqual([]);
  });

  it("5) estado ativo reconhece subrotas dinâmicas dentro de um módulo (ex.: /financeiro/despesas, /estoque/produtos/abc123)", () => {
    expect(resolveActiveModuleId("/financeiro/dre")).toBe("financeiro");
    expect(resolveActiveModuleId("/financeiro/despesas")).toBe("financeiro");
    expect(resolveActiveModuleId("/estoque/produtos/abc123")).toBe("estoque");
    expect(resolveActiveModuleId("/ordens/servicos/lavacao-completa")).toBe("central-operacoes");
    expect(resolveActiveModuleId("/crm/fidelizacao")).toBe("crm");
  });

  it("estado ativo reconhece rotas de topo agrupadas em Central de Operações, mesmo sem prefixo comum com /dashboard", () => {
    expect(resolveActiveModuleId("/operacao")).toBe("central-operacoes");
    expect(resolveActiveModuleId("/movimentacoes")).toBe("central-operacoes");
    expect(resolveActiveModuleId("/lavacao")).toBe("central-operacoes");
    expect(resolveActiveModuleId("/estacionamento")).toBe("central-operacoes");
    expect(resolveActiveModuleId("/painel-gerencial")).toBe("central-operacoes");
  });

  it("rota fora de qualquer módulo (ex.: /login) não é atribuída a nenhum módulo", () => {
    expect(resolveActiveModuleId("/login")).toBeNull();
  });

  it("2) itens antigos que viraram atalho não têm mais entrada própria na lista de módulos principais (a lateral não fica poluída)", () => {
    const moduleHrefs = new Set(APP_MODULES.map((m) => m.href));
    // exemplos de itens antigos que agora são só atalhos dentro de um módulo, nunca item de topo
    expect(moduleHrefs.has("/financeiro/dre")).toBe(false);
    expect(moduleHrefs.has("/estoque/produtos")).toBe(false);
    expect(moduleHrefs.has("/movimentacoes")).toBe(false);
    expect(moduleHrefs.has("/seguranca")).toBe(false);
  });
});

describe("resolveModuleLinkHref — respeita OPERATIONAL_ALLOWED_PREFIXES, Missão UX/Navegação 3", () => {
  it("ADMIN sempre recebe o href principal do módulo", () => {
    const central = APP_MODULES.find((m) => m.id === "central-operacoes")!;
    expect(resolveModuleLinkHref(central, "admin")).toBe("/dashboard");
  });

  it("sem sessão individual (role null), sempre o href principal — comportamento de hoje preservado", () => {
    const financeiro = APP_MODULES.find((m) => m.id === "financeiro")!;
    expect(resolveModuleLinkHref(financeiro, null)).toBe("/financeiro");
  });

  it("OPERACIONAL não pode acessar /dashboard diretamente — cai no primeiro atalho permitido (mesma superfície de antes)", () => {
    const central = APP_MODULES.find((m) => m.id === "central-operacoes")!;
    const href = resolveModuleLinkHref(central, "operacional");
    expect(href).not.toBeNull();
    expect(href).not.toBe("/dashboard");
  });

  it("OPERACIONAL não pode acessar /estoque diretamente — cai em /estoque/produtos (permitido)", () => {
    const estoque = APP_MODULES.find((m) => m.id === "estoque")!;
    expect(resolveModuleLinkHref(estoque, "operacional")).toBe("/estoque/produtos");
  });

  it("OPERACIONAL não tem nenhum acesso a Financeiro/CRM/Marketing/Zézinho/Configurações — módulo fica null (oculto), mesma restrição de antes", () => {
    for (const id of ["financeiro", "crm", "marketing", "zezinho", "configuracoes", "planejamento"]) {
      const appModule = APP_MODULES.find((m) => m.id === id)!;
      expect(resolveModuleLinkHref(appModule, "operacional")).toBeNull();
    }
  });

  it("OPERACIONAL acessa Atendimento normalmente (href principal permitido)", () => {
    const atendimento = APP_MODULES.find((m) => m.id === "atendimento")!;
    expect(resolveModuleLinkHref(atendimento, "operacional")).toBe("/atendimento");
  });
});
