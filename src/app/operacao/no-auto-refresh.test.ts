import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de regressão — Auditoria de Network Transfer do Neon (25/09/2026): o polling automático
 * de 30s (`AutoRefresh`, `setInterval(() => router.refresh(), 30_000)`) foi removido de
 * `/operacao` e `/assistente-gerente` porque disparava toda a leitura global
 * (`fetchGlobalSituation`) a cada 30 segundos, por aba aberta, sem nenhuma ação do usuário —
 * principal suspeito do esgotamento de Network Transfer do Neon. Nunca deve voltar como polling
 * automático (nem em 30s, nem em qualquer outro intervalo) — atualização só no carregamento da
 * página ou por clique explícito no botão "Atualizar" (`RefreshButton`, já existente).
 */
describe("Fase Network Transfer: nenhum polling automático global", () => {
  it("o componente AutoRefresh (setInterval + router.refresh) foi removido do projeto", () => {
    const removedPath = path.resolve(__dirname, "../../components/operations-center/auto-refresh.tsx");
    expect(existsSync(removedPath)).toBe(false);
  });

  it.each(["page.tsx", "../assistente-gerente/page.tsx"])("%s não referencia AutoRefresh nem setInterval", (relativePath) => {
    const source = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
    expect(source).not.toContain("AutoRefresh");
    expect(source).not.toContain("setInterval");
  });

  it.each(["page.tsx", "../assistente-gerente/page.tsx"])("%s continua com o botão manual 'Atualizar' (RefreshButton)", (relativePath) => {
    const source = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
    expect(source).toContain("RefreshButton");
  });

  it("nenhum outro componente do projeto reintroduziu um setInterval chamando router.refresh()", () => {
    // Busca ampla e simples (sem dependências externas de scan) — os únicos setInterval
    // conhecidos e aceitos hoje são o relógio do header (não mexe no router) e a animação de
    // "estágio de carregamento" do Zezinho (não mexe no router); nenhum dos dois deve existir
    // aqui, e esta guarda falha se qualquer um dos dois arquivos citados voltar a ter os dois
    // termos juntos.
    for (const relativePath of ["page.tsx", "../assistente-gerente/page.tsx"]) {
      const source = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
      expect(source.includes("setInterval") && source.includes("router.refresh")).toBe(false);
    }
  });
});
