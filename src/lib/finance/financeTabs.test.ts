import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FINANCE_TABS, financeTabHref, hrefForFinanceTab, resolveFinanceTab } from "@/lib/finance/financeTabs";
import { resolveFinancePeriod } from "@/lib/finance/financePeriod";

/** As rotas especializadas de /financeiro que precisam continuar existindo intactas após a Missão 5B (Fase 1). */
const FINANCE_ROUTES = [
  "/financeiro",
  "/financeiro/dre",
  "/financeiro/fluxo-de-caixa",
  "/financeiro/contas-a-receber",
  "/financeiro/contas-a-pagar",
  "/financeiro/despesas",
  "/financeiro/fechamento",
  "/financeiro/classificacao",
  "/financeiro/stone-conciliacao",
  "/financeiro/conta-stone",
  "/financeiro/fornecedores",
];

describe("A) as 9 áreas financeiras existem — Missão Financeiro 5B/5D", () => {
  it("FINANCE_TABS tem exatamente 9 abas, nos rótulos pedidos (Lavação/Estacionamento como abas de primeiro nível — Missão 5D)", () => {
    expect(FINANCE_TABS).toHaveLength(9);
    expect(FINANCE_TABS.map((t) => t.label)).toEqual([
      "Visão Geral",
      "Lavação",
      "Estacionamento",
      "DRE",
      "Fluxo de Caixa",
      "Contas",
      "Despesas",
      "Stone",
      "Fechamento",
    ]);
  });

  it("nenhum valor de aba duplicado", () => {
    const values = FINANCE_TABS.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("B) resolução de aba ativa — Missão Financeiro 5B", () => {
  it("sem parâmetro `tab`, a aba ativa é 'visao-geral'", () => {
    expect(resolveFinanceTab(undefined)).toBe("visao-geral");
  });

  it("com `tab` válido, a aba ativa é a pedida", () => {
    expect(resolveFinanceTab("lavacao")).toBe("lavacao");
    expect(resolveFinanceTab("estacionamento")).toBe("estacionamento");
    expect(resolveFinanceTab("dre")).toBe("dre");
    expect(resolveFinanceTab("fluxo")).toBe("fluxo");
    expect(resolveFinanceTab("contas")).toBe("contas");
    expect(resolveFinanceTab("despesas")).toBe("despesas");
    expect(resolveFinanceTab("stone")).toBe("stone");
    expect(resolveFinanceTab("fechamento")).toBe("fechamento");
  });

  it("com `tab` desconhecido/inválido, cai em 'visao-geral' — nunca uma aba em branco", () => {
    expect(resolveFinanceTab("qualquer-coisa-invalida")).toBe("visao-geral");
    expect(resolveFinanceTab("")).toBe("visao-geral");
  });

  it("hrefForFinanceTab: 'visao-geral' é sempre a URL base, sem querystring", () => {
    expect(hrefForFinanceTab("visao-geral")).toBe("/financeiro");
  });

  it("hrefForFinanceTab: demais abas usam ?tab=", () => {
    expect(hrefForFinanceTab("dre")).toBe("/financeiro?tab=dre");
    expect(hrefForFinanceTab("fechamento")).toBe("/financeiro?tab=fechamento");
  });
});

describe("F) financeTabHref — Missão Financeiro 5D.5 (clique real das abas)", () => {
  const period = resolveFinancePeriod({ periodo: "specific_month", mes: "7", ano: "2026" });

  it("1) href da aba Lavação contém tab=lavacao", () => {
    expect(financeTabHref("lavacao", period)).toContain("tab=lavacao");
  });

  it("2) href da aba Estacionamento contém tab=estacionamento", () => {
    expect(financeTabHref("estacionamento", period)).toContain("tab=estacionamento");
  });

  it("3) parâmetros de período (periodo/mes/ano) são preservados ao trocar de aba", () => {
    const href = financeTabHref("lavacao", period);
    expect(href).toContain("periodo=specific_month");
    expect(href).toContain("mes=07");
    expect(href).toContain("ano=2026");
    expect(href).toContain("tab=lavacao");
  });

  it("3b) período personalizado (inicio/fim) também é preservado", () => {
    const custom = resolveFinancePeriod({ periodo: "custom", inicio: "2026-04-01", fim: "2026-04-30" });
    const href = financeTabHref("estacionamento", custom);
    expect(href).toContain("inicio=2026-04-01");
    expect(href).toContain("fim=2026-04-30");
    expect(href).toContain("tab=estacionamento");
  });

  it("4) Visão Geral nunca carrega tab= na URL — resolveFinanceTab(undefined) já cai nela por padrão", () => {
    const href = financeTabHref("visao-geral", period);
    expect(href).not.toContain("tab=");
    expect(resolveFinanceTab(undefined)).toBe("visao-geral");
  });

  it("5) todas as 9 abas produzem um href válido, começando por /financeiro?", () => {
    for (const tab of FINANCE_TABS) {
      const href = financeTabHref(tab.value, period);
      expect(href.startsWith("/financeiro?")).toBe(true);
      expect(href).toContain("periodo=specific_month");
    }
  });

  it("6) nenhum href aponta para preview/Vercel — só URLs internas relativas", () => {
    for (const tab of FINANCE_TABS) {
      const href = financeTabHref(tab.value, period);
      expect(href).not.toContain("vercel");
      expect(href).not.toContain("http");
      expect(href.startsWith("/")).toBe(true);
    }
  });

  it("7) todas as 9 abas têm um item em FINANCE_TABS (nenhuma fica ausente/desabilitada)", () => {
    expect(FINANCE_TABS.map((t) => t.value)).toEqual([
      "visao-geral",
      "lavacao",
      "estacionamento",
      "dre",
      "fluxo",
      "contas",
      "despesas",
      "stone",
      "fechamento",
    ]);
  });
});

describe("G) alternância real Lavação <-> Estacionamento — Missão Financeiro 5D.6", () => {
  const period = resolveFinancePeriod({ periodo: "month" });

  it("3) troca lavacao -> estacionamento: aba resolvida muda, href muda, sem nenhum resquício da aba anterior", () => {
    const first = resolveFinanceTab("lavacao");
    const firstHref = financeTabHref(first, period);
    const second = resolveFinanceTab("estacionamento");
    const secondHref = financeTabHref(second, period);

    expect(first).toBe("lavacao");
    expect(second).toBe("estacionamento");
    expect(firstHref).not.toBe(secondHref);
    expect(secondHref).not.toContain("tab=lavacao");
    expect(secondHref).toContain("tab=estacionamento");
  });

  it("4) troca estacionamento -> lavacao: mesma garantia, na ordem inversa", () => {
    const first = resolveFinanceTab("estacionamento");
    const firstHref = financeTabHref(first, period);
    const second = resolveFinanceTab("lavacao");
    const secondHref = financeTabHref(second, period);

    expect(first).toBe("estacionamento");
    expect(second).toBe("lavacao");
    expect(firstHref).not.toBe(secondHref);
    expect(secondHref).not.toContain("tab=estacionamento");
    expect(secondHref).toContain("tab=lavacao");
  });

  it("6) cada href sempre sobrescreve a tab explicitamente — nunca soma tab=lavacao&tab=estacionamento", () => {
    for (const target of ["lavacao", "estacionamento", "dre", "fluxo", "contas", "despesas", "stone", "fechamento"] as const) {
      const href = financeTabHref(target, period);
      const tabOccurrences = href.match(/tab=/g) ?? [];
      expect(tabOccurrences.length).toBe(1);
    }
  });

  it("7) a aba ativa é determinada exclusivamente pelo parâmetro `tab` recebido — resolveFinanceTab é uma função pura de um único argumento, sem memória de chamadas anteriores", () => {
    // Chamar em sequência alternada várias vezes prova que não há estado guardado entre chamadas.
    expect(resolveFinanceTab("lavacao")).toBe("lavacao");
    expect(resolveFinanceTab("estacionamento")).toBe("estacionamento");
    expect(resolveFinanceTab("lavacao")).toBe("lavacao");
    expect(resolveFinanceTab("estacionamento")).toBe("estacionamento");
    expect(resolveFinanceTab(undefined)).toBe("visao-geral"); // mesmo depois de chamadas anteriores, sem parâmetro cai sempre em visao-geral
  });

  it("8) nenhuma dependência de estado client-side na navegação das abas — tabs.tsx não é Client Component e não usa useState/useEffect", () => {
    const source = readFileSync(join(process.cwd(), "src/components/ui/tabs.tsx"), "utf-8");
    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("useState");
    expect(source).not.toContain("useEffect");
    expect(source).not.toContain("router.push");
    expect(source).not.toContain("router.replace");
    expect(source).not.toContain("preventDefault");
    // navegação garantida por âncora HTML pura, nunca por next/link (Client Component que exige hidratação)
    expect(source).not.toContain("next/link");
    expect(source).toContain("<a");
  });
});

describe("C/E) preservação das rotas antigas / nenhuma rota financeira órfã — Missão Financeiro 5B", () => {
  it("o page.tsx de cada rota financeira especializada continua existindo no filesystem", () => {
    const appDir = join(process.cwd(), "src/app");
    const missing = FINANCE_ROUTES.filter((route) => !existsSync(join(appDir, route.slice(1), "page.tsx")));
    expect(missing).toEqual([]);
  });
});

describe("D) atalhos internos das novas abas apontam para rotas reais — Missão Financeiro 5B", () => {
  it("os atalhos da aba Contas (Contas a Receber/Contas a Pagar) existem no filesystem", () => {
    const appDir = join(process.cwd(), "src/app");
    expect(existsSync(join(appDir, "financeiro/contas-a-receber/page.tsx"))).toBe(true);
    expect(existsSync(join(appDir, "financeiro/contas-a-pagar/page.tsx"))).toBe(true);
  });

  it("os atalhos da aba Stone (Conciliação/Extrato) existem no filesystem", () => {
    const appDir = join(process.cwd(), "src/app");
    expect(existsSync(join(appDir, "financeiro/stone-conciliacao/page.tsx"))).toBe(true);
    expect(existsSync(join(appDir, "financeiro/conta-stone/page.tsx"))).toBe(true);
  });

  it("os atalhos secundários da aba Despesas (Classificação/Fornecedores) existem no filesystem", () => {
    const appDir = join(process.cwd(), "src/app");
    expect(existsSync(join(appDir, "financeiro/classificacao/page.tsx"))).toBe(true);
    expect(existsSync(join(appDir, "financeiro/fornecedores/page.tsx"))).toBe(true);
  });
});
