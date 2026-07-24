import { describe, expect, it } from "vitest";
import { runDiretoria, ALL_DIRECTOR_IDS } from "@/lib/zezinho/directors/diretoria";

describe("runDiretoria — orquestrador da Reunião de Diretoria (Sprint 5.0, Z1)", () => {
  it("roda os 8 Diretores por padrão, sem lançar mesmo sem JumpPark/clima configurados neste ambiente", async () => {
    const consolidated = await runDiretoria();
    expect(consolidated.reports).toHaveLength(8);
    expect(consolidated.reports.map((r) => r.director).sort()).toEqual(ALL_DIRECTOR_IDS.slice().sort());
  });

  it("RH e Marketing nunca participam do Executive Briefing automaticamente", async () => {
    const consolidated = await runDiretoria();
    expect(consolidated.participatingDirectors).not.toContain("rh");
    expect(consolidated.participatingDirectors).not.toContain("marketing");
  });

  it("Diretor de Inteligência sempre declara o limite atual do seu alcance", async () => {
    const consolidated = await runDiretoria();
    const inteligencia = consolidated.reports.find((r) => r.director === "inteligencia");
    expect(inteligencia?.limitations.some((l) => l.includes("Memória Operacional"))).toBe(true);
  });

  it("roda um subconjunto de Diretores quando pedido (pergunta de um único domínio)", async () => {
    const consolidated = await runDiretoria(["estoque"]);
    expect(consolidated.reports).toHaveLength(1);
    expect(consolidated.reports[0].director).toBe("estoque");
  });

  it("nunca duplica um Diretor mesmo se pedido duas vezes", async () => {
    const consolidated = await runDiretoria(["estoque", "estoque"]);
    expect(consolidated.reports).toHaveLength(1);
  });

  it("nunca inventa dado — todo relatório sem fonte real é honesto sobre isso", async () => {
    const consolidated = await runDiretoria();
    const rh = consolidated.reports.find((r) => r.director === "rh")!;
    const marketing = consolidated.reports.find((r) => r.director === "marketing")!;
    expect(rh.limitations.length).toBeGreaterThan(0);
    expect(marketing.limitations.length).toBeGreaterThan(0);
  });
});
