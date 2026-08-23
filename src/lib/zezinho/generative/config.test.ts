import { describe, expect, it } from "vitest";
import { describeGenerativeMode } from "@/lib/zezinho/generative/config";

/**
 * Missão Z3.4 — auditoria end-to-end encontrou o painel "Sobre o Zézinho" lendo um módulo de
 * config LEGADO (`ai-provider.ts`, de uma sprint anterior à Z2) que nunca reflete
 * `ZEZINHO_GENERATIVE_ENABLED` — resultado: o painel dizia "Analítico local" mesmo com o modo
 * generativo real ativo e respondendo em produção. Estes testes travam que `describeGenerativeMode`
 * (a única fonte usada agora por `/zezinho`) segue exatamente a mesma config que
 * `answerGenerative`/`orchestrator.ts` usam de verdade — nunca uma fonte paralela que possa
 * divergir de novo.
 */
describe("describeGenerativeMode — o rótulo exibido nunca pode divergir do pipeline real", () => {
  it("generativo desligado -> badge 'Analítico local', nunca menciona um modelo/provider inexistente", () => {
    const mode = describeGenerativeMode({ enabled: false, model: "openai/gpt-oss-20b" });
    expect(mode.badgeLabel).toBe("Analítico local");
    expect(mode.description).toMatch(/sem depender de um provedor de ia externo/i);
    expect(mode.description).not.toContain("gpt-oss");
  });

  it("generativo ligado -> badge cita o modelo real configurado, nunca 'Analítico local'", () => {
    const mode = describeGenerativeMode({ enabled: true, model: "openai/gpt-oss-20b" });
    expect(mode.badgeLabel).toBe("IA generativa (openai/gpt-oss-20b)");
    expect(mode.badgeLabel).not.toBe("Analítico local");
  });

  it("generativo ligado -> descrição menciona o fallback como plano de segurança, nunca esconde que ele existe", () => {
    const mode = describeGenerativeMode({ enabled: true, model: "openai/gpt-oss-20b" });
    expect(mode.description).toMatch(/fallback/i);
    expect(mode.description).toMatch(/modo anal[íi]tico local/i);
  });

  it("o badge acompanha o modelo configurado — nunca hardcoded para um modelo fixo diferente do real", () => {
    const mode = describeGenerativeMode({ enabled: true, model: "outro-modelo/futuro" });
    expect(mode.badgeLabel).toBe("IA generativa (outro-modelo/futuro)");
  });
});
