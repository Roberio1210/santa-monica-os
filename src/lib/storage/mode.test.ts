import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Missão Emergencial de Limpeza de Contaminação de Testes (28/08/2026) — testes da blindagem
 * fail-closed em isolamento total: nenhum teste aqui abre uma conexão Postgres real (as URLs
 * usadas são fictícias e, quando presentes, o próprio comportamento esperado é que NUNCA sejam
 * usadas para conectar). Cada teste usa `vi.resetModules()` + import dinâmico para pegar uma
 * instância nova do módulo, isolando o estado interno `warnedOnce` entre cenários.
 */

async function loadStorageMode() {
  vi.resetModules();
  return import("./mode");
}

describe("getStorageMode — blindagem fail-closed contra contaminação de teste", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("A. NODE_ENV=test + DATABASE_URL de produção presente + SEM TEST_DATABASE_URL: nunca usa DATABASE_URL, cai em memória e avisa (nunca conecta silenciosamente)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgres://prod-user:prod-pass@ep-real-production-host.neon.tech/neondb");
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getStorageMode } = await loadStorageMode();
    expect(getStorageMode()).toBe("memory");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("TEST_DATABASE_URL");
  });

  it("B. NODE_ENV=test sem DATABASE_URL e sem TEST_DATABASE_URL: memória, sem aviso (não há nada sendo ignorado)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getStorageMode } = await loadStorageMode();
    expect(getStorageMode()).toBe("memory");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("C. NODE_ENV=test com TEST_DATABASE_URL definida explicitamente: modo postgres é permitido (banco de teste declarado, não produção)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TEST_DATABASE_URL", "postgres://test-user:test-pass@localhost:5432/santa_monica_test");
    vi.stubEnv("DATABASE_URL", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getStorageMode } = await loadStorageMode();
    expect(getStorageMode()).toBe("postgres");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("D. Fora de teste (NODE_ENV=production) com DATABASE_URL: comportamento original 100% preservado — usa DATABASE_URL normalmente", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://prod-user:prod-pass@ep-real-production-host.neon.tech/neondb");
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getStorageMode } = await loadStorageMode();
    expect(getStorageMode()).toBe("postgres");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("E. Fora de teste (NODE_ENV=production) sem DATABASE_URL: memória — sem regressão no caminho de produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("TEST_DATABASE_URL", undefined);

    const { getStorageMode } = await loadStorageMode();
    expect(getStorageMode()).toBe("memory");
  });

  it("nunca emite o aviso mais de uma vez por módulo carregado (não polui o log de uma suíte inteira)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgres://prod-user:prod-pass@ep-real-production-host.neon.tech/neondb");
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getStorageMode } = await loadStorageMode();
    getStorageMode();
    getStorageMode();
    getStorageMode();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
