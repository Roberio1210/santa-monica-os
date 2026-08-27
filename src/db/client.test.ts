import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Missão Emergencial de Limpeza de Contaminação de Testes (28/08/2026) — testes da blindagem
 * fail-closed de `resolveConnectionUrl()`/`isDatabaseConfigured()`/`getDb()` em isolamento total.
 * Nenhum teste aqui abre uma conexão Postgres real: nos cenários em que uma URL "de produção"
 * está presente, o comportamento correto é justamente NUNCA usá-la (nem instanciar o client
 * `postgres`) — por isso `getDb()` só é chamado nos cenários em que o resultado esperado é
 * `null` (sem URL nenhuma), o que não toca a rede em nenhuma hipótese.
 */

async function loadClient() {
  vi.resetModules();
  return import("./client");
}

describe("db/client — resolução de URL de conexão fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("A. NODE_ENV=test + DATABASE_URL de produção presente + SEM TEST_DATABASE_URL: isDatabaseConfigured() é false e getDb() retorna null sem instanciar client Postgres", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgres://prod-user:prod-pass@ep-real-production-host.neon.tech/neondb");
    vi.stubEnv("TEST_DATABASE_URL", undefined);

    const { isDatabaseConfigured, getDb } = await loadClient();
    expect(isDatabaseConfigured()).toBe(false);
    expect(getDb()).toBeNull();
  });

  it("B. NODE_ENV=test sem DATABASE_URL e sem TEST_DATABASE_URL: isDatabaseConfigured() é false e getDb() retorna null", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("TEST_DATABASE_URL", undefined);

    const { isDatabaseConfigured, getDb } = await loadClient();
    expect(isDatabaseConfigured()).toBe(false);
    expect(getDb()).toBeNull();
  });

  it("C. NODE_ENV=test com TEST_DATABASE_URL definida explicitamente: isDatabaseConfigured() é true (banco de teste declarado é aceito)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TEST_DATABASE_URL", "postgres://test-user:test-pass@localhost:5432/santa_monica_test");
    vi.stubEnv("DATABASE_URL", undefined);

    const { isDatabaseConfigured } = await loadClient();
    expect(isDatabaseConfigured()).toBe(true);
  });

  it("D. Fora de teste (NODE_ENV=production) com DATABASE_URL: comportamento original preservado — isDatabaseConfigured() é true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://prod-user:prod-pass@ep-real-production-host.neon.tech/neondb");
    vi.stubEnv("TEST_DATABASE_URL", undefined);

    const { isDatabaseConfigured } = await loadClient();
    expect(isDatabaseConfigured()).toBe(true);
  });

  it("E. Fora de teste (NODE_ENV=production) sem DATABASE_URL: isDatabaseConfigured() é false e getDb() retorna null — sem regressão no caminho de produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("TEST_DATABASE_URL", undefined);

    const { isDatabaseConfigured, getDb } = await loadClient();
    expect(isDatabaseConfigured()).toBe(false);
    expect(getDb()).toBeNull();
  });

  it("TEST_DATABASE_URL nunca é considerada fora de NODE_ENV=test, mesmo se estiver definida por engano", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST_DATABASE_URL", "postgres://test-user:test-pass@localhost:5432/santa_monica_test");
    vi.stubEnv("DATABASE_URL", undefined);

    const { isDatabaseConfigured, getDb } = await loadClient();
    expect(isDatabaseConfigured()).toBe(false);
    expect(getDb()).toBeNull();
  });
});
