import { describe, expect, it, beforeAll } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";

beforeAll(() => {
  process.env.SESSION_SECRET = "chave-de-teste-nunca-usada-em-producao-0123456789";
});

describe("signSessionToken/verifySessionToken", () => {
  it("assina e verifica um payload real (userId/role/name)", async () => {
    const token = await signSessionToken({ userId: "user-1", role: "admin", name: "Robério" });
    const payload = await verifySessionToken(token);
    expect(payload).toEqual({ userId: "user-1", role: "admin", name: "Robério" });
  });

  it("rejeita token adulterado", async () => {
    const token = await signSessionToken({ userId: "user-1", role: "operacional", name: "Vinicius" });
    const tampered = token.slice(0, -4) + "abcd";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejeita string que não é um JWT", async () => {
    expect(await verifySessionToken("nao-e-um-token")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("lança erro claro se SESSION_SECRET não estiver configurada", async () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      await expect(signSessionToken({ userId: "x", role: "admin", name: "x" })).rejects.toThrow(/SESSION_SECRET/);
    } finally {
      process.env.SESSION_SECRET = original;
    }
  });
});
