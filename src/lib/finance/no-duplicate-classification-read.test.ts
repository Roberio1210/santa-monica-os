import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de regressão — Auditoria de Network Transfer do Neon (25/09/2026): dentro de
 * `fetchCentralOverview` (`operations/central.ts`), `fetchCashFlowOverview` (ledger completo) e
 * `fetchClassificationQueue`/`fetchDreSourceData` rodam no mesmo `Promise.all` — antes, cada uma
 * chamava `getFinanceRepository().listFinancialClassifications()`/`listClassificationRules()`
 * diretamente, disparando a mesma tabela inteira duas vezes por requisição. A correção faz as duas
 * usarem `fetchAllFinancialClassificationsRaw`/`fetchAllClassificationRulesRaw`
 * (`cache()`-wrapped) — esta guarda garante que a chamada direta ao repositório nunca volta.
 */
describe("Fase Network Transfer: leitura de classificações/regras nunca duplicada dentro da mesma requisição", () => {
  it("service.ts exporta fetchAllFinancialClassificationsRaw/fetchAllClassificationRulesRaw envolvidas por cache()", () => {
    const source = readFileSync(path.resolve(__dirname, "service.ts"), "utf-8");
    expect(source).toMatch(/export const fetchAllFinancialClassificationsRaw = cache\(/);
    expect(source).toMatch(/export const fetchAllClassificationRulesRaw = cache\(/);
  });

  it("fetchCashFlowOverview usa as funções compartilhadas, nunca o repositório direto, no ramo do ledger", () => {
    const source = readFileSync(path.resolve(__dirname, "service.ts"), "utf-8");
    const start = source.indexOf("export const fetchCashFlowOverview");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n});", start);
    const body = source.slice(start, end);
    expect(body).toContain("fetchAllFinancialClassificationsRaw()");
    expect(body).toContain("fetchAllClassificationRulesRaw()");
    expect(body).not.toContain("getFinanceRepository().listFinancialClassifications()");
    expect(body).not.toContain("getFinanceRepository().listClassificationRules()");
  });

  it("fetchDreSourceData usa as funções compartilhadas, nunca o repositório direto", () => {
    const source = readFileSync(path.resolve(__dirname, "service.ts"), "utf-8");
    const start = source.indexOf("export const fetchDreSourceData");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n});", start);
    const body = source.slice(start, end);
    expect(body).toContain("fetchAllFinancialClassificationsRaw()");
    expect(body).toContain("fetchAllClassificationRulesRaw()");
    expect(body).not.toContain("repo.listFinancialClassifications()");
    expect(body).not.toContain("repo.listClassificationRules()");
  });
});
