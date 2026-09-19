import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStonePersistenceRepositoryForTests } from "@/lib/integrations/stone/persistence/repository-factory";
import { resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { resolvePeriod } from "@/lib/utils/timezone";

/**
 * Missão 82 (VG1), Parte Q — prova de ponta a ponta de que uma falha isolada num domínio
 * (Stone, aqui) nunca derruba os demais nem os transforma num zero silencioso.
 */
vi.mock("@/lib/integrations/stone/persistence/repository-factory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/stone/persistence/repository-factory")>();
  return {
    ...actual,
    getStonePersistenceRepository: () => {
      throw new Error("Falha simulada de conexão Stone — só para este teste.");
    },
  };
});

describe("getOperationalOverview — Missão 82 (isolamento de falha por domínio)", () => {
  beforeEach(() => {
    resetStonePersistenceRepositoryForTests();
    resetFinanceRepositoryForTests();
  });

  it("Stone lançando erro -> seção Stone vira 'unavailable', mas agenda/capacidade/finanças continuam íntegras", async () => {
    const { getOperationalOverview } = await import("@/lib/overview/service");
    const period = resolvePeriod("today", undefined, new Date("2026-09-19T12:00:00Z"));

    const overview = await getOperationalOverview(period);

    expect(overview.stone.status).toBe("unavailable");
    expect(overview.stone.saldoDisponivel).toBeNull();
    expect(overview.stone.vendasNoPeriodo).toEqual({ count: 0, netAmount: 0 });

    // As demais seções nunca derrubam por causa do erro isolado da Stone.
    expect(overview.finance.status).toBe("ok");
    expect(overview.appointments.status).toBe("ok");
    expect(overview.revenue).toBeDefined();

    // O alerta correto aparece — nunca escondido.
    expect(overview.alerts.some((a) => a.id === "stone-unavailable")).toBe(true);
  });
});
