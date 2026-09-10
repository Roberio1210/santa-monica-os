import { and, eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() })),
}));

import { setPasswordAction } from "@/app/definir-senha/actions";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { verifyPassword } from "@/lib/auth/password";
import { provisionUser } from "@/lib/auth/provisioning";

/**
 * Missão 53 (Parte E/G) — `setPasswordAction` nunca tinha teste antes desta missão. Cobre
 * exatamente os pontos que a missão pediu para auditar: token expirado rejeitado, token inválido
 * rejeitado, uso único (segunda tentativa com o mesmo token falha), senha nunca em texto puro,
 * `passwordHash` gravado e token/expiração limpos (`null`) só depois de sucesso, usuário inativo
 * bloqueado mesmo com token válido. Só roda contra Postgres real de teste (`TEST_DATABASE_URL`) —
 * `setPasswordAction` sempre escreve de verdade em `users`, sem fallback em memória.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const TEST_EMAIL_SUFFIX = "@missao53-setpassword-test.invalid";
let counter = 0;

function testEmail(): string {
  counter++;
  return `pessoa-${counter}${TEST_EMAIL_SUFFIX}`;
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function cleanup() {
  const db = getDb()!;
  await db.delete(users).where(like(users.email, `%${TEST_EMAIL_SUFFIX}`));
}

describe.skipIf(!hasRealDb)("setPasswordAction — Missão 53", () => {
  beforeEach(() => {
    // createSessionCookie -> signSessionToken precisa de SESSION_SECRET (mesmo valor fixo de teste já usado em middleware.test.ts).
    process.env.SESSION_SECRET = "segredo-de-teste-nunca-usado-em-producao";
  });

  afterEach(async () => {
    await cleanup();
  });

  it("token válido -> define a senha (hash gravado, nunca texto puro), invalida o token, redireciona para a home do papel", async () => {
    const db = getDb()!;
    const created = await provisionUser(db, { email: testEmail(), name: "Teste", role: "operacional" });
    if (created.status !== "created") throw new Error("esperado created");

    await expect(
      setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "senhaValida123", confirmPassword: "senhaValida123" })),
    ).rejects.toThrow("REDIRECT:/atendimento");

    const [row] = await db.select().from(users).where(eq(users.id, created.userId)).limit(1);
    expect(row.passwordHash).not.toBeNull();
    expect(row.passwordHash).not.toContain("senhaValida123");
    expect(await verifyPassword("senhaValida123", row.passwordHash!)).toBe(true);
    expect(row.passwordSetupToken).toBeNull(); // token invalidado
    expect(row.passwordSetupTokenExpiresAt).toBeNull(); // expiração limpa junto
    expect(row.mustChangePassword).toBe(false);
  });

  it("uso único: o mesmo token não funciona numa segunda tentativa", async () => {
    const db = getDb()!;
    const created = await provisionUser(db, { email: testEmail(), name: "Teste", role: "admin" });
    if (created.status !== "created") throw new Error("esperado created");

    await expect(
      setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "primeiraSenha1", confirmPassword: "primeiraSenha1" })),
    ).rejects.toThrow("REDIRECT:/dashboard");

    const result = await setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "segundaSenha2", confirmPassword: "segundaSenha2" }));
    expect(result.error).toBe("Este link expirou ou já foi usado. Peça um novo link ao administrador.");

    // a senha continua sendo a primeira, nunca a segunda tentativa
    const [row] = await db.select().from(users).where(eq(users.id, created.userId)).limit(1);
    expect(await verifyPassword("primeiraSenha1", row.passwordHash!)).toBe(true);
    expect(await verifyPassword("segundaSenha2", row.passwordHash!)).toBe(false);
  });

  it("token expirado é rejeitado, nada é alterado", async () => {
    const db = getDb()!;
    const created = await provisionUser(db, { email: testEmail(), name: "Teste", role: "operacional" });
    if (created.status !== "created") throw new Error("esperado created");

    await db.update(users).set({ passwordSetupTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.id, created.userId));

    const result = await setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "qualquerSenha1", confirmPassword: "qualquerSenha1" }));
    expect(result.error).toBe("Este link expirou ou já foi usado. Peça um novo link ao administrador.");

    const [row] = await db.select().from(users).where(eq(users.id, created.userId)).limit(1);
    expect(row.passwordHash).toBeNull();
    expect(row.passwordSetupToken).not.toBeNull(); // token expirado, mas nunca "consumido" às cegas
  });

  it("token inválido/inexistente é rejeitado", async () => {
    const result = await setPasswordAction({ error: null }, formData({ token: "token-que-nunca-existiu", password: "qualquerSenha1", confirmPassword: "qualquerSenha1" }));
    expect(result.error).toBe("Este link expirou ou já foi usado. Peça um novo link ao administrador.");
  });

  it("token vazio é rejeitado sem consultar o banco", async () => {
    const result = await setPasswordAction({ error: null }, formData({ token: "", password: "qualquerSenha1", confirmPassword: "qualquerSenha1" }));
    expect(result.error).toBe("Link inválido.");
  });

  it("senha curta (<8) é rejeitada antes de tocar o banco", async () => {
    const db = getDb()!;
    const created = await provisionUser(db, { email: testEmail(), name: "Teste", role: "admin" });
    if (created.status !== "created") throw new Error("esperado created");

    const result = await setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "curta", confirmPassword: "curta" }));
    expect(result.error).toBe("A senha precisa ter pelo menos 8 caracteres.");

    const [row] = await db.select().from(users).where(eq(users.id, created.userId)).limit(1);
    expect(row.passwordHash).toBeNull(); // token continua válido, nada foi consumido
  });

  it("senhas que não coincidem são rejeitadas", async () => {
    const db = getDb()!;
    const created = await provisionUser(db, { email: testEmail(), name: "Teste", role: "admin" });
    if (created.status !== "created") throw new Error("esperado created");

    const result = await setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "senhaValida123", confirmPassword: "outraSenha456" }));
    expect(result.error).toBe("As senhas não coincidem.");
  });

  it("usuário inativo com token válido é bloqueado (o mesmo teste de active=true de getCurrentUser, aplicado à definição de senha)", async () => {
    const db = getDb()!;
    const created = await provisionUser(db, { email: testEmail(), name: "Teste", role: "operacional" });
    if (created.status !== "created") throw new Error("esperado created");

    await db.update(users).set({ active: false }).where(eq(users.id, created.userId));

    const result = await setPasswordAction({ error: null }, formData({ token: created.setupToken, password: "qualquerSenha1", confirmPassword: "qualquerSenha1" }));
    expect(result.error).toBe("Este link expirou ou já foi usado. Peça um novo link ao administrador.");

    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, created.userId)))
      .limit(1);
    expect(row.passwordHash).toBeNull();
  });
});
