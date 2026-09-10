import { eq, like } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { isPathAllowedForRole, ROLE_HOME_PATH } from "@/lib/auth/permissions";
import { provisionUser } from "@/lib/auth/provisioning";

/**
 * Missão 53 — só roda contra Postgres real de teste (`TEST_DATABASE_URL`, nunca
 * `DATABASE_URL`/produção — garantia de `src/db/client.ts`). Todo e-mail usado aqui termina em
 * `.invalid` (TLD reservado pela IANA, nunca roteável, nunca um domínio real) para nunca colidir
 * com um usuário de verdade e para o `cleanup()` conseguir apagar com segurança só o que este
 * arquivo criou.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const TEST_EMAIL_SUFFIX = "@missao53-provisioning-test.invalid";

function testEmail(local: string): string {
  return `${local}${TEST_EMAIL_SUFFIX}`;
}

async function cleanup() {
  const db = getDb()!;
  await db.delete(users).where(like(users.email, `%${TEST_EMAIL_SUFFIX}`));
}

describe.skipIf(!hasRealDb)("provisionUser — Missão 53 (Postgres real, planning-tests)", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("cria usuário ADMIN: ativo, sem senha, com token de setup e expiração em +24h", async () => {
    const db = getDb()!;
    const now = new Date("2026-09-10T12:00:00Z");
    const result = await provisionUser(db, { email: testEmail("robero-admin"), name: "Robério", role: "admin", now });

    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("esperado created");
    expect(result.role).toBe("admin");
    expect(result.setupToken.length).toBeGreaterThan(30);
    expect(result.setupTokenExpiresAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);

    const [row] = await db.select().from(users).where(eq(users.id, result.userId)).limit(1);
    expect(row.active).toBe(true);
    expect(row.passwordHash).toBeNull();
    expect(row.mustChangePassword).toBe(false);
    expect(row.passwordSetupToken).toBe(result.setupToken);
  });

  it("cria usuário OPERACIONAL normalmente (mesmo fluxo, role diferente)", async () => {
    const db = getDb()!;
    const result = await provisionUser(db, { email: testEmail("vinicius-operacional"), name: "Vinicius", role: "operacional" });
    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("esperado created");
    expect(result.role).toBe("operacional");
  });

  it("role inválida (fora de admin/operacional) é rejeitada, nada é criado", async () => {
    const db = getDb()!;
    const result = await provisionUser(db, { email: testEmail("papel-invalido"), name: "Alguém", role: "gerente" as never });
    expect(result.status).toBe("invalid_role");

    const rows = await db.select().from(users).where(eq(users.email, testEmail("papel-invalido")));
    expect(rows).toHaveLength(0);
  });

  it("e-mail inválido é rejeitado, nada é criado", async () => {
    const db = getDb()!;
    const result = await provisionUser(db, { email: "nao-e-um-email", name: "Alguém", role: "admin" });
    expect(result.status).toBe("invalid_email");
  });

  it("nome vazio é rejeitado, nada é criado", async () => {
    const db = getDb()!;
    const result = await provisionUser(db, { email: testEmail("sem-nome"), name: "   ", role: "admin" });
    expect(result.status).toBe("invalid_name");
  });

  it("normaliza o e-mail (trim + lowercase) — mesma normalização usada pelo login", async () => {
    const db = getDb()!;
    const rawEmail = "  Maiuscula@MISSAO53-PROVISIONING-TEST.INVALID  ";
    const result = await provisionUser(db, { email: rawEmail, name: "Teste", role: "admin" });
    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("esperado created");
    expect(result.email).toBe(testEmail("maiuscula"));
  });

  it("duplicidade: segunda tentativa com o mesmo e-mail NÃO cria outra linha, NÃO altera role/hash/token da existente", async () => {
    const db = getDb()!;
    const email = testEmail("duplicado");
    const first = await provisionUser(db, { email, name: "Primeiro", role: "operacional" });
    expect(first.status).toBe("created");
    if (first.status !== "created") throw new Error("esperado created");

    const second = await provisionUser(db, { email, name: "Segunda Tentativa", role: "admin" });
    expect(second.status).toBe("already_exists");
    if (second.status !== "already_exists") throw new Error("esperado already_exists");
    expect(second.userId).toBe(first.userId);
    expect(second.role).toBe("operacional"); // nunca vira admin por causa da segunda chamada

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1); // nunca duas linhas
    expect(rows[0].name).toBe("Primeiro"); // nome da segunda tentativa nunca sobrescreveu
    expect(rows[0].passwordSetupToken).toBe(first.setupToken); // token original nunca foi trocado silenciosamente
  });

  it("nunca chama console.log/console.error — nenhum token/hash sai por log automático, só pelo retorno da função", async () => {
    const db = getDb()!;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await provisionUser(db, { email: testEmail("sem-log"), name: "Teste", role: "admin" });
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("Missão 52 (Parte H) — usuário provisionado como admin recebe a matriz ADMIN (acesso total, home /dashboard)", async () => {
    const db = getDb()!;
    const result = await provisionUser(db, { email: testEmail("compat-admin"), name: "Teste", role: "admin" });
    if (result.status !== "created") throw new Error("esperado created");
    expect(isPathAllowedForRole(result.role, "/configuracoes")).toBe(true);
    expect(isPathAllowedForRole(result.role, "/financeiro")).toBe(true);
    expect(ROLE_HOME_PATH[result.role]).toBe("/dashboard");
  });

  it("Missão 52 (Parte H) — usuário provisionado como operacional recebe a matriz OPERACIONAL (Central de Operações/Atendimento/Planejamento permitidos, Configurações bloqueado)", async () => {
    const db = getDb()!;
    const result = await provisionUser(db, { email: testEmail("compat-operacional"), name: "Teste", role: "operacional" });
    if (result.status !== "created") throw new Error("esperado created");
    expect(isPathAllowedForRole(result.role, "/operacao")).toBe(true);
    expect(isPathAllowedForRole(result.role, "/atendimento")).toBe(true);
    expect(isPathAllowedForRole(result.role, "/planejamento")).toBe(true);
    expect(isPathAllowedForRole(result.role, "/configuracoes")).toBe(false);
    expect(isPathAllowedForRole(result.role, "/financeiro")).toBe(false);
    expect(ROLE_HOME_PATH[result.role]).toBe("/atendimento");
  });
});
