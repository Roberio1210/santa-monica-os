import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/config/env", () => ({ isJumpParkConfigured: vi.fn(() => true) }));
vi.mock("@/db/client", () => ({ getDb: vi.fn(() => ({ fake: "db" })) }));
vi.mock("@/lib/integrations/jumppark/gap-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/jumppark/gap-audit")>()),
  runJumpParkGapAudit: vi.fn(),
}));

// Prova de ausência: se a rota algum dia acionar qualquer uma destas camadas de escrita, o teste explode.
const never = (what: string) => () => {
  throw new Error(`NUNCA deveria ser chamado pela auditoria: ${what}`);
};
vi.mock("@/lib/integrations/jumppark/sync", () => ({ syncJumpParkServiceOrders: never("sync") }));
vi.mock("@/lib/integrations/jumppark/backfill", () => ({ runHistoricalBackfill: never("backfill") }));
vi.mock("@/lib/integrations/jumppark/customersRefresh", () => ({ refreshJumpParkCustomers: never("clientes") }));
vi.mock("@/lib/jumppark-orders/automatic-consumption", () => ({ processAutomaticConsumption: never("consumo") }));
vi.mock("@/lib/jumppark-orders/confirmation", () => ({ confirmOrderConsumption: never("confirmação de consumo") }));
vi.mock("@/lib/jumppark-orders/service-mapping", () => ({ registerSeenServiceNames: never("mapeamento de serviços") }));

import { GET } from "@/app/api/admin/jumppark-auditoria/route";
import { getCurrentUser } from "@/lib/auth/session";
import { isJumpParkConfigured } from "@/lib/config/env";
import { runJumpParkGapAudit } from "@/lib/integrations/jumppark/gap-audit";
import { JumpParkRequestError } from "@/lib/integrations/jumppark/client";

const BASE = "https://app.test/api/admin/jumppark-auditoria";
const admin = { id: "u1", email: "a@x", name: "Admin", role: "admin" as const };

function get(qs: string) {
  return GET(new Request(`${BASE}${qs}`));
}

describe("GET /api/admin/jumppark-auditoria", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(runJumpParkGapAudit).mockReset();
    vi.mocked(isJumpParkConfigured).mockReturnValue(true);
  });

  it("sem sessão: 401, nada consultado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await get("?from=2026-09-19&to=2026-10-01");
    expect(res.status).toBe(401);
    expect(runJumpParkGapAudit).not.toHaveBeenCalled();
  });

  it("usuário operacional: 403, nada consultado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: "operacional" });
    const res = await get("?from=2026-09-19&to=2026-10-01");
    expect(res.status).toBe(403);
    expect(runJumpParkGapAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["?from=2026-09-19&to=2026-10-01&apply=1", /não permitido/],
    ["?from=2026-09-19", /AAAA-MM-DD/],
    ["?from=2026-10-01&to=2026-09-19", /anterior/],
    ["?from=2026-08-01&to=2026-10-01", /máximo/],
  ])("parâmetros inválidos %s → 400", async (qs, msg) => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(msg);
    expect(runJumpParkGapAudit).not.toHaveBeenCalled();
  });

  it("JumpPark não configurado: 503", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(isJumpParkConfigured).mockReturnValue(false);
    expect((await get("?from=2026-09-19&to=2026-10-01")).status).toBe(503);
  });

  it("admin: roda a auditoria do período pedido, sem cache", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(runJumpParkGapAudit).mockResolvedValue({ period: { from: "2026-09-19", to: "2026-10-01" } } as never);
    const res = await get("?from=2026-09-19&to=2026-10-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(runJumpParkGapAudit).toHaveBeenCalledWith("2026-09-19", "2026-10-01", { db: { fake: "db" } });
  });

  it("erro da API vira mensagem sanitizada, sem detalhe interno", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(runJumpParkGapAudit).mockRejectedValue(new JumpParkRequestError(401, "token=SEGREDO-NAO-PODE-VAZAR"));
    const res = await get("?from=2026-09-19&to=2026-10-01");
    const body = JSON.stringify(await res.json());
    expect(res.status).toBe(502);
    expect(body).toContain("HTTP 401");
    expect(body).not.toContain("SEGREDO");
  });

  it("erro inesperado não vaza a mensagem original", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(runJumpParkGapAudit).mockRejectedValue(new Error("postgres://user:senha@host/db falhou"));
    const body = JSON.stringify(await (await get("?from=2026-09-19&to=2026-10-01")).json());
    expect(body).not.toContain("senha");
    expect(body).toMatch(/omitidos por segurança/);
  });
});
