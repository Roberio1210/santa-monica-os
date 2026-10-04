import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enforceIndividualSession } from "../../../middleware";
import { signSessionToken } from "@/lib/auth/jwt";
import { isPathAllowedForRole } from "@/lib/auth/permissions";
import { APP_MODULES, resolveActiveModuleId, resolveModuleLinkHref } from "@/components/navigation/app-modules";

/**
 * Módulo Emergência (Fase 1) — acesso de rota: a Central (/emergencia) é liberada para OPERACIONAL
 * (somente leitura); a administração (/configuracoes/emergencia) continua bloqueada pelo
 * default-deny. Nenhuma outra regra de RBAC foi alterada.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-nunca-usado-em-producao";
  process.env.INDIVIDUAL_AUTH_ENABLED = "true";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function request(pathname: string, cookieValue?: string): NextRequest {
  return new NextRequest(`https://example.com${pathname}`, cookieValue ? { headers: { cookie: `smos_session=${cookieValue}` } } : undefined);
}

describe("permissões de rota", () => {
  it("OPERACIONAL acessa a Central e os protocolos", () => {
    expect(isPathAllowedForRole("operacional", "/emergencia")).toBe(true);
    expect(isPathAllowedForRole("operacional", "/emergencia/protocolo/incendio")).toBe(true);
  });

  it("OPERACIONAL não acessa a administração da Central", () => {
    expect(isPathAllowedForRole("operacional", "/configuracoes/emergencia")).toBe(false);
  });

  it("prefixo não vaza para rotas parecidas", () => {
    expect(isPathAllowedForRole("operacional", "/emergencia-admin")).toBe(false);
  });

  it("ADMIN acessa tudo", () => {
    expect(isPathAllowedForRole("admin", "/emergencia")).toBe(true);
    expect(isPathAllowedForRole("admin", "/configuracoes/emergencia")).toBe(true);
  });
});

describe("middleware com sessão individual ligada", () => {
  it("sem login, /emergencia redireciona para /login (autenticação continua exigida)", async () => {
    const result = await enforceIndividualSession(request("/emergencia"));
    expect(result?.headers.get("location")).toContain("/login");
  });

  it("OPERACIONAL logado entra em /emergencia", async () => {
    const token = await signSessionToken({ userId: "u-op", role: "operacional", name: "Operacional Teste" });
    expect(await enforceIndividualSession(request("/emergencia", token))).toBeNull();
    expect(await enforceIndividualSession(request("/emergencia/protocolo/incendio", token))).toBeNull();
  });

  it("OPERACIONAL logado é barrado em /configuracoes/emergencia", async () => {
    const token = await signSessionToken({ userId: "u-op", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/configuracoes/emergencia", token));
    expect(result?.headers.get("location")).toContain("/atendimento");
  });
});

describe("menu", () => {
  it("existe o módulo 'Emergência' apontando para /emergencia, visível para admin e operacional", () => {
    const emergencia = APP_MODULES.find((m) => m.id === "emergencia")!;
    expect(emergencia.label).toBe("Emergência");
    expect(emergencia.href).toBe("/emergencia");
    expect(resolveModuleLinkHref(emergencia, "admin")).toBe("/emergencia");
    expect(resolveModuleLinkHref(emergencia, "operacional")).toBe("/emergencia");
    expect(resolveModuleLinkHref(emergencia, null)).toBe("/emergencia");
  });

  it("estado ativo: protocolos ficam em Emergência; a administração fica em Configurações", () => {
    expect(resolveActiveModuleId("/emergencia/protocolo/incendio")).toBe("emergencia");
    expect(resolveActiveModuleId("/configuracoes/emergencia")).toBe("configuracoes");
  });
});
