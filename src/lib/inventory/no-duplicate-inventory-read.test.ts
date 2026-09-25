import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Remove comentários de bloco (`/* ... *\/`) antes de checar chamadas de código — os próprios comentários desta auditoria citam o padrão proibido como texto explicativo, o que geraria falso positivo numa checagem ingênua de substring. */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Guarda de regressão — Auditoria de Network Transfer do Neon (23/09/2026): `fetchInventoryOverview`
 * e `fetchDataQualitySummary` são chamadas na MESMA requisição (via `fetchGlobalSituation`/
 * `fetchCentralOverview`, `operations/central.ts`) e sempre precisaram exatamente da mesma tabela
 * inteira de itens ativos. Antes, cada uma chamava `getInventoryRepository().listItems()`
 * diretamente — duas consultas idênticas por requisição. A correção faz as duas usarem
 * `fetchRawInventoryItems` (`cache()`-wrapped) — esta guarda garante que `data-quality.ts` nunca
 * volta a chamar o repositório direto.
 */
describe("Fase Network Transfer: leitura de inventário nunca duplicada dentro da mesma requisição", () => {
  it("data-quality.ts nunca chama getInventoryRepository().listItems() diretamente", () => {
    const source = stripBlockComments(readFileSync(path.resolve(__dirname, "data-quality.ts"), "utf-8"));
    expect(source).not.toContain("getInventoryRepository().listItems()");
    expect(source).not.toContain("getInventoryRepository()"); // nem importado mais nesse arquivo
  });

  it("data-quality.ts usa fetchRawInventoryItems (a mesma leitura compartilhada de service.ts)", () => {
    const source = readFileSync(path.resolve(__dirname, "data-quality.ts"), "utf-8");
    expect(source).toContain("fetchRawInventoryItems");
    expect(source).toContain('from "@/lib/inventory/service"');
  });

  it("service.ts exporta fetchRawInventoryItems envolvida por cache() e fetchInventoryOverview a reaproveita", () => {
    const source = readFileSync(path.resolve(__dirname, "service.ts"), "utf-8");
    expect(source).toMatch(/export const fetchRawInventoryItems = cache\(/);
    // fetchInventoryOverview precisa chamar fetchRawInventoryItems(), nunca o repositório direto de novo.
    const overviewIndex = source.indexOf("export const fetchInventoryOverview");
    expect(overviewIndex).toBeGreaterThan(-1);
    const overviewBody = source.slice(overviewIndex);
    expect(overviewBody).toContain("fetchRawInventoryItems()");
    expect(overviewBody).not.toContain("getInventoryRepository().listItems()");
  });
});
