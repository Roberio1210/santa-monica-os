import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/config/env", () => ({ isJumpParkConfigured: vi.fn(() => true) }));
vi.mock("@/db/client", () => ({ getDb: vi.fn(() => ({ fake: "db" })) }));
vi.mock("@/lib/integrations/jumppark/gap-recovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/jumppark/gap-recovery")>()),
  simulateGapRecovery: vi.fn(),
  executeGapRecovery: vi.fn(),
}));

// Prova de ausência: qualquer camada com efeito colateral explode se for chamada.
const never = (what: string) => () => {
  throw new Error(`NUNCA deveria ser chamado pela recuperação: ${what}`);
};
vi.mock("@/lib/integrations/jumppark/sync", () => ({ syncJumpParkServiceOrders: never("sync") }));
vi.mock("@/lib/integrations/jumppark/backfill", () => ({ runHistoricalBackfill: never("backfill") }));
vi.mock("@/lib/integrations/jumppark/customersRefresh", () => ({ refreshJumpParkCustomers: never("clientes") }));
vi.mock("@/lib/jumppark-orders/automatic-consumption", () => ({ processAutomaticConsumption: never("consumo") }));
vi.mock("@/lib/jumppark-orders/confirmation", () => ({ confirmOrderConsumption: never("confirmação de consumo") }));
vi.mock("@/lib/jumppark-orders/service-mapping", () => ({ registerSeenServiceNames: never("mapeamento de serviços") }));
vi.mock("@/lib/finance/jumpparkPartnerLinking", () => ({ refreshJumpParkPartnerLinks: never("vínculo financeiro") }));
vi.mock("@/lib/jumppark-orders/historical-theoretical-consumption", () => ({ processHistoricalTheoreticalConsumption: never("consumo teórico") }));

import { GET, POST } from "@/app/api/admin/jumppark-recuperacao/route";
import { getCurrentUser } from "@/lib/auth/session";
import { executeGapRecovery, GAP_RECOVERY_CONFIRM_PHRASE, RecoveryAbortedError, simulateGapRecovery, type RecoveryPlan } from "@/lib/integrations/jumppark/gap-recovery";

const BASE = "https://app.test/api/admin/jumppark-recuperacao";
const admin = { id: "admin-1", email: "a@x", name: "Admin", role: "admin" as const };
const HASH = "b".repeat(64);

const PLAN: RecoveryPlan = {
  window: { from: "2026-09-21", to: "2026-09-25" },
  orders: [],
  totals: { orders: 46, items: 24, parkingAmountCents: 118_200, servicesAmountCents: 706_000, totalAmountCents: 824_200, itemsAmountCents: 720_000 },
  ordersByExitDate: { "2026-09-21": { orders: 2, parkingAmount: 0, servicesAmount: 630, totalAmount: 630 } },
  blockers: [],
  planHash: HASH,
  preview: [{ code: "1", plateMasked: "AB***23", entryDateTime: null, exitDateTime: null, orderDate: "2026-09-21", parkingAmount: 0, servicesAmount: 630, totalAmount: 630, paymentMethod: "Crédito", situation: "Pago", items: [] }],
  apiPagesTruncated: false,
};

function post(body: unknown, headers: Record<string, string> = { origin: "https://app.test", "content-type": "application/json" }) {
  return POST(new Request(BASE, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

describe("/api/admin/jumppark-recuperacao", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(simulateGapRecovery).mockReset().mockResolvedValue(PLAN);
    vi.mocked(executeGapRecovery).mockReset();
  });

  describe("autorização", () => {
    it.each([
      [null, 401],
      [{ ...admin, role: "operacional" as const }, 403],
    ])("GET e POST recusam usuário %o (%i) sem consultar nem gravar", async (user, status) => {
      vi.mocked(getCurrentUser).mockResolvedValue(user);
      expect((await GET(new Request(BASE))).status).toBe(status);
      expect((await post({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE })).status).toBe(status);
      expect(simulateGapRecovery).not.toHaveBeenCalled();
      expect(executeGapRecovery).not.toHaveBeenCalled();
    });
  });

  describe("GET (simulação)", () => {
    beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue(admin));

    it("devolve a simulação sem gravar e sem cache", async () => {
      const res = await GET(new Request(BASE));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(body).toEqual(expect.objectContaining({ modo: "simulacao", gravouAlgo: false, podeGravar: true, planHash: HASH }));
      expect(body.totais).toEqual({ ordens: 46, itens: 24, estacionamento: 1182, lavacaoServicos: 7060, total: 8242, somaDosItens: 7200 });
      expect(executeGapRecovery).not.toHaveBeenCalled();
    });

    it("versão HTML escapa conteúdo e só mostra o formulário sem bloqueios", async () => {
      vi.mocked(simulateGapRecovery).mockResolvedValue({ ...PLAN, blockers: ["<script>alert(1)</script>"] });
      const text = await (await GET(new Request(`${BASE}?formato=html`))).text();
      expect(text).toContain("&lt;script&gt;");
      expect(text).not.toContain("<script>alert");
      expect(text).not.toContain("<form");
    });

    it("rejeita parâmetros: a janela é fixa", async () => {
      expect((await GET(new Request(`${BASE}?from=2026-09-01`))).status).toBe(400);
      expect(simulateGapRecovery).not.toHaveBeenCalled();
    });
  });

  describe("POST (gravação)", () => {
    beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue(admin));

    it("exige mesma origem (bloqueia pedido forjado por outro site)", async () => {
      expect((await post({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE }, { origin: "https://malicioso.test", "content-type": "application/json" })).status).toBe(403);
      expect((await post({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE }, { "content-type": "application/json" })).status).toBe(403);
      expect(executeGapRecovery).not.toHaveBeenCalled();
    });

    it.each([
      [{ planHash: "curto", confirmacao: GAP_RECOVERY_CONFIRM_PHRASE }, /planHash/],
      [{ planHash: HASH, confirmacao: "sim" }, /Digite exatamente/],
      ["{não é json", /inválido/],
    ])("valida hash e frase de confirmação %#", async (body, msg) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(msg);
      expect(executeGapRecovery).not.toHaveBeenCalled();
    });

    it("com tudo certo, grava com o hash aprovado e o administrador como autor", async () => {
      vi.mocked(executeGapRecovery).mockResolvedValue({ insertedOrders: 46, insertedItems: 24, totals: PLAN.totals, planHash: HASH });
      const res = await post({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE });
      expect(res.status).toBe(200);
      expect(executeGapRecovery).toHaveBeenCalledWith({ fake: "db" }, HASH, "admin-1");
      expect(await res.json()).toEqual(expect.objectContaining({ gravouAlgo: true, ordensInseridas: 46, itensInseridos: 24, totais: { estacionamento: 1182, lavacaoServicos: 7060, total: 8242, somaDosItens: 7200 } }));
    });

    it("aceita o formulário HTML (form-urlencoded)", async () => {
      vi.mocked(executeGapRecovery).mockResolvedValue({ insertedOrders: 46, insertedItems: 24, totals: PLAN.totals, planHash: HASH });
      const body = new URLSearchParams({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE }).toString();
      const res = await post(body, { origin: "https://app.test", "content-type": "application/x-www-form-urlencoded" });
      expect(res.status).toBe(200);
    });

    it("abortada (plano mudou, ordem já existe, divergência): 409, nada gravado, mensagem clara", async () => {
      vi.mocked(executeGapRecovery).mockRejectedValue(new RecoveryAbortedError("O plano mudou desde a simulação aprovada — nada foi gravado."));
      const res = await post({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "O plano mudou desde a simulação aprovada — nada foi gravado.", gravouAlgo: false });
    });

    it("erro inesperado não vaza detalhe interno", async () => {
      vi.mocked(executeGapRecovery).mockRejectedValue(new Error("postgres://user:senha@host falhou"));
      const body = JSON.stringify(await (await post({ planHash: HASH, confirmacao: GAP_RECOVERY_CONFIRM_PHRASE })).json());
      expect(body).not.toContain("senha");
      expect(body).toMatch(/desfeita por inteiro/);
    });
  });
});
