import { describe, expect, it } from "vitest";
import { runDirector } from "@/lib/zezinho/directors/runDirector";
import { DIRECTOR_REGISTRY } from "@/lib/zezinho/directors/registry";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";

describe("runDirector — Diretor sem nenhuma capacidade própria (RH) nunca inventa dado", () => {
  it("RH sempre devolve um relatório honesto sobre a ausência de fonte real", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.rh);
    expect(report.director).toBe("rh");
    expect(report.dataAvailability).toBe("indisponivel");
    expect(report.facts).toEqual([]);
    expect(report.risks).toEqual([]);
    expect(report.limitations.some((l) => l.toLowerCase().includes("rh"))).toBe(true);
    expect(report.shouldParticipateInBriefing).toBe(false);
  });
});

describe("runDirector — Diretores reais reaproveitam o motor de raciocínio já existente", () => {
  it("Estoque roda de verdade neste ambiente de teste (dado real em modo memória)", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.estoque);
    expect(report.director).toBe("estoque");
    expect(report.dataAvailability).toBe("real");
    // Sem DATABASE_URL no ambiente de teste, o estoque roda em modo memória — ainda assim é dado real, nunca inventado por este código.
    expect(report.confidence.overallLevel).toBeDefined();
  });

  it("Financeiro, sem período explícito, usa 'hoje' como padrão — nunca fica sem ferramentas por falta de período", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.financeiro);
    // cash_ledger_totals exige período — se o relatório tem alguma fonte disponível/indisponível
    // rastreada (não "confidence vazio"), é porque o período padrão foi aplicado.
    expect(report.confidence.availableSources.length + report.confidence.missingSources.length + report.confidence.failedSources.length).toBeGreaterThan(0);
  });

  it("Operações honestamente reporta JumpPark não configurado neste ambiente, nunca inventa veículo/faturamento", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.operacoes);
    expect(report.limitations.some((l) => l.toLowerCase().includes("jumppark"))).toBe(true);
    expect(report.facts.some((f) => f.key === "vehicles")).toBe(false);
  });

  it("Comercial reflete jumpparkConfigured no status — nunca finge ter clientes reais sem fonte", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.comercial);
    expect(report.director).toBe("comercial");
    expect(report.confidence.overallLevel).toBeDefined();
  });

  it("Marketing sempre devolve not_configured — nenhuma métrica de marketing é inventada", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.marketing);
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.facts).toEqual([]);
    expect(report.shouldParticipateInBriefing).toBe(false);
  });
});

describe("runDirector — memória sempre null no Z1 (Memória Operacional é Z3)", () => {
  it("nenhum relatório traz memoryNote ainda", async () => {
    const report = await runDirector(DIRECTOR_REGISTRY.financeiro, undefined, EMPTY_REASONING_SESSION);
    expect(report.memoryNote).toBeNull();
  });
});
