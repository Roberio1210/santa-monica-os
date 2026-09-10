import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enforceIndividualSession } from "../../../middleware";
import { signSessionToken } from "@/lib/auth/jwt";

/**
 * Missão 52 (Parte I) — `enforceIndividualSession` (middleware.ts) é o ponto único e autoritativo
 * que decide se uma requisição sem sessão/com papel não autorizado é bloqueada — nunca a UI
 * sozinha. Cobre exatamente os cenários exigidos: sem login bloqueado, flag desligada preserva o
 * comportamento de hoje, sessão inválida/expirada redireciona para login, papel não autorizado
 * redireciona para a home do próprio papel (nunca renderiza o conteúdo proibido).
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-nunca-usado-em-producao";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function request(pathname: string, cookieValue?: string): NextRequest {
  const url = `https://example.com${pathname}`;
  const headers = cookieValue ? { cookie: `smos_session=${cookieValue}` } : undefined;
  return new NextRequest(url, headers ? { headers } : undefined);
}

describe("enforceIndividualSession — flag desligada (estado de hoje na maioria dos ambientes)", () => {
  it("sem INDIVIDUAL_AUTH_ENABLED, qualquer rota passa direto (null), mesmo sem cookie nenhum", async () => {
    delete process.env.INDIVIDUAL_AUTH_ENABLED;
    const result = await enforceIndividualSession(request("/financeiro"));
    expect(result).toBeNull();
  });
});

describe("enforceIndividualSession — flag ligada, SEM LOGIN", () => {
  beforeEach(() => {
    process.env.INDIVIDUAL_AUTH_ENABLED = "true";
  });

  it("rota protegida sem cookie de sessão -> redireciona para /login (bloqueado de verdade, nunca renderiza)", async () => {
    const result = await enforceIndividualSession(request("/financeiro"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(307); // NextResponse.redirect padrão
    expect(result?.headers.get("location")).toContain("/login");
  });

  it("cookie de sessão inválido/corrompido -> redireciona para /login", async () => {
    const result = await enforceIndividualSession(request("/financeiro", "token-invalido-e-corrompido"));
    expect(result?.headers.get("location")).toContain("/login");
  });

  it("rotas de autenticação (/login, /definir-senha) continuam acessíveis mesmo sem sessão", async () => {
    expect(await enforceIndividualSession(request("/login"))).toBeNull();
    expect(await enforceIndividualSession(request("/definir-senha"))).toBeNull();
  });

  it("rotas públicas (ex. /api/health) continuam acessíveis mesmo sem sessão", async () => {
    expect(await enforceIndividualSession(request("/api/health"))).toBeNull();
  });
});

describe("enforceIndividualSession — flag ligada, COM sessão válida", () => {
  beforeEach(() => {
    process.env.INDIVIDUAL_AUTH_ENABLED = "true";
  });

  it("admin -> acessa rota financeira normalmente (null, sem bloqueio)", async () => {
    const token = await signSessionToken({ userId: "u-admin", role: "admin", name: "Admin Teste" });
    const result = await enforceIndividualSession(request("/financeiro", token));
    expect(result).toBeNull();
  });

  it("admin -> acessa rota exclusiva de admin (/configuracoes) normalmente (null, sem bloqueio)", async () => {
    const token = await signSessionToken({ userId: "u-admin", role: "admin", name: "Admin Teste" });
    const result = await enforceIndividualSession(request("/configuracoes", token));
    expect(result).toBeNull();
  });

  it("operacional autenticado -> acessa sua própria home (/atendimento) normalmente (null, sem bloqueio)", async () => {
    const token = await signSessionToken({ userId: "u-operacional", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/atendimento", token));
    expect(result).toBeNull();
  });

  it("operacional em rota financeira -> bloqueado de verdade, redireciona para a HOME do próprio papel (/atendimento), nunca renderiza Financeiro", async () => {
    const token = await signSessionToken({ userId: "u-operacional", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/financeiro", token));
    expect(result).not.toBeNull();
    expect(result?.headers.get("location")).toContain("/atendimento");
    expect(result?.headers.get("location")).not.toContain("/financeiro");
  });

  it("operacional tentando acesso direto por URL a uma subrota profunda de admin (/financeiro/dre) -> bloqueado igualmente, nunca renderiza (proteção por prefixo cobre qualquer link direto, não só a raiz)", async () => {
    const token = await signSessionToken({ userId: "u-operacional", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/financeiro/dre", token));
    expect(result).not.toBeNull();
    expect(result?.headers.get("location")).toContain("/atendimento");
  });

  it("operacional em /planejamento (Missão 52) -> permitido, sem redirecionamento", async () => {
    const token = await signSessionToken({ userId: "u-operacional", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/planejamento", token));
    expect(result).toBeNull();
  });

  it("operacional em /planejamento/novo -> permitido", async () => {
    const token = await signSessionToken({ userId: "u-operacional", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/planejamento/novo", token));
    expect(result).toBeNull();
  });

  it("operacional em /configuracoes -> bloqueado, redireciona para /atendimento", async () => {
    const token = await signSessionToken({ userId: "u-operacional", role: "operacional", name: "Operacional Teste" });
    const result = await enforceIndividualSession(request("/configuracoes", token));
    expect(result?.headers.get("location")).toContain("/atendimento");
  });
});
