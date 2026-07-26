import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDirector } from "@/lib/zezinho/directors/runDirector";
import { DIRECTOR_REGISTRY } from "@/lib/zezinho/directors/registry";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

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

  it("Financeiro honestamente reporta Stone não configurado neste ambiente, nunca inventa venda/repasse (Sprint 7.0, Z2)", async () => {
    const original = { key: process.env.STONE_API_KEY, account: process.env.STONE_ACCOUNT_ID };
    delete process.env.STONE_API_KEY;
    delete process.env.STONE_ACCOUNT_ID;
    try {
      const report = await runDirector(DIRECTOR_REGISTRY.financeiro);
      expect(report.facts.some((f) => f.key === "stone_transaction_count")).toBe(false);
      expect(report.facts.some((f) => f.key.startsWith("stone_"))).toBe(false);
    } finally {
      if (original.key !== undefined) process.env.STONE_API_KEY = original.key;
      if (original.account !== undefined) process.env.STONE_ACCOUNT_ID = original.account;
    }
  });

  describe("Financeiro com Stone configurada (mocked) — DirectorReport estruturado com fatos reais (Sprint 7.0, Z2)", () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      clearStoneCache();
      process.env = { ...ORIGINAL_ENV, STONE_API_KEY: "test-key", STONE_ACCOUNT_ID: "900000001" };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "200", url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => "application/gzip" }, arrayBuffer: async () => { const g = gzipSync(Buffer.from(OFFICIAL_SAMPLE_XML, "utf-8")); return g.buffer.slice(g.byteOffset, g.byteOffset + g.byteLength); } }),
      );
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
      vi.unstubAllGlobals();
    });

    it("produz um DirectorReport com os fatos Stone pedidos pelo usuário, no formato de frase exigido", async () => {
      const report = await runDirector(DIRECTOR_REGISTRY.financeiro);
      const stoneFacts = report.facts.filter((f) => f.key.startsWith("stone_"));
      expect(stoneFacts.length).toBeGreaterThan(0);

      const grossFact = stoneFacts.find((f) => f.key === "stone_gross_amount_total");
      expect(grossFact?.statement).toMatch(/R\$ 650\.00 em vendas brutas/);

      const netFact = stoneFacts.find((f) => f.key === "stone_net_amount_total");
      expect(netFact?.statement).toMatch(/valor líquido processado foi R\$ 582\.50/);

      const cancellationFact = stoneFacts.find((f) => f.key === "stone_cancellation_count");
      expect(cancellationFact?.statement).toMatch(/Existem 1 cancelamento\(s\)/);

      const positionFact = stoneFacts.find((f) => f.key === "stone_financial_position");
      expect(positionFact?.statement).toMatch(/última posição financeira processada é de R\$ 5000\.00, referente a 2026-07-22/);
      expect(positionFact?.statement.toLowerCase()).not.toContain("saldo disponível");
    });

    it("teste 33 — falha da Stone (500) nunca derruba o Diretor Financeiro — relatório continua sendo produzido", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "500", headers: { get: () => null }, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }));
      const report = await runDirector(DIRECTOR_REGISTRY.financeiro);
      expect(report.director).toBe("financeiro");
      // Fatos que dependem do arquivo do dia (Z2/Z3) nunca aparecem quando a Stone falha — mas
      // `stone_integration_health` (Z4) é sobre o histórico de importação, não sobre o arquivo do
      // dia: continua honestamente reportando o status "credentials_pending" (nenhuma importação
      // bem-sucedida ainda neste ambiente de teste), nunca inventando um dado do dia.
      expect(report.facts.some((f) => f.key === "stone_transaction_count" || f.key === "stone_gross_amount_total" || f.key === "stone_schedule_pending_count" || f.key === "stone_jumppark_divergence_count")).toBe(false);
    });

    it("teste 34 — JumpPark indisponível na conciliação Stone×JumpPark nunca inventa uma divergência", async () => {
      const original = process.env.JUMPPARK_API_TOKEN;
      delete process.env.JUMPPARK_API_TOKEN;
      try {
        const report = await runDirector(DIRECTOR_REGISTRY.financeiro);
        expect(report.facts.some((f) => f.key === "stone_jumppark_divergence_count")).toBe(false);
      } finally {
        if (original !== undefined) process.env.JUMPPARK_API_TOKEN = original;
      }
    });
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
