import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, generateSetupToken } from "@/lib/auth/password";

describe("hashPassword/verifyPassword", () => {
  it("nunca guarda a senha em texto puro no hash resultante", async () => {
    const hash = await hashPassword("minhaSenhaSecreta123!");
    expect(hash).not.toContain("minhaSenhaSecreta123!");
    expect(hash.startsWith("scrypt:")).toBe(true);
  });

  it("verifica corretamente a senha certa", async () => {
    const hash = await hashPassword("senhaCorreta");
    expect(await verifyPassword("senhaCorreta", hash)).toBe(true);
  });

  it("rejeita a senha errada", async () => {
    const hash = await hashPassword("senhaCorreta");
    expect(await verifyPassword("senhaErrada", hash)).toBe(false);
  });

  it("dois hashes da mesma senha são diferentes (salt aleatório)", async () => {
    const a = await hashPassword("mesmaSenha");
    const b = await hashPassword("mesmaSenha");
    expect(a).not.toBe(b);
    expect(await verifyPassword("mesmaSenha", a)).toBe(true);
    expect(await verifyPassword("mesmaSenha", b)).toBe(true);
  });

  it("rejeita hash malformado sem lançar exceção", async () => {
    await expect(verifyPassword("qualquer", "isto-nao-e-um-hash-valido")).resolves.toBe(false);
    await expect(verifyPassword("qualquer", "scrypt:apenas-duas-partes")).resolves.toBe(false);
  });
});

describe("generateSetupToken", () => {
  it("gera tokens longos e diferentes a cada chamada", () => {
    const a = generateSetupToken();
    const b = generateSetupToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });
});
