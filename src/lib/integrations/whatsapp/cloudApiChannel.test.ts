import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { whatsappCloudApiChannel } from "@/lib/integrations/whatsapp/cloudApiChannel";
import { getAutonomyLevel, type OutboundMessageRecord } from "@/lib/management/outboundMessages";

/**
 * Missão Z6.2 — testes obrigatórios 1, 4, 5, 6, 7, 10, 20 (+ 17, checklist de completude). Mocka
 * as duas dependências que tocam banco (`resolveRecipientPhone`, `getLastInboundMessageAt`) e o
 * `fetch` global — nunca bate numa rede real. `loadWhatsappCloudApiConfig()` lê `process.env` a
 * cada chamada de `.send()`, não no momento do import — por isso um único import estático do
 * canal já é suficiente, sem precisar reimportar por teste. O ponto central destes testes é
 * NEGATIVO: provar que `fetch` só é chamado no único caminho legítimo (habilitado + credenciais +
 * aprovada + telefone resolvido + dentro da janela), e em nenhum outro.
 */

vi.mock("@/lib/integrations/whatsapp/recipientResolution", () => ({
  resolveRecipientPhone: (...args: unknown[]) => resolveRecipientPhoneMock(...args),
}));
vi.mock("@/lib/management/inboundMessages", () => ({
  getLastInboundMessageAt: (...args: unknown[]) => getLastInboundMessageAtMock(...args),
}));

const resolveRecipientPhoneMock = vi.fn();
const getLastInboundMessageAtMock = vi.fn();
const SENTINEL_TOKEN = "SENTINEL_SECRET_TOKEN_NUNCA_DEVE_APARECER_EM_LOG";

const ENV_KEYS = ["WHATSAPP_ENABLED", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"] as const;
let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resolveRecipientPhoneMock.mockReset();
  getLastInboundMessageAtMock.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  vi.restoreAllMocks();
});

function enableWithValidConfig() {
  process.env.WHATSAPP_ENABLED = "true";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id-123";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba-456";
  process.env.WHATSAPP_ACCESS_TOKEN = SENTINEL_TOKEN;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-abc";
  process.env.WHATSAPP_APP_SECRET = "secret-def";
}

function buildMessage(overrides: Partial<OutboundMessageRecord> = {}): OutboundMessageRecord {
  return {
    id: "msg-1",
    kind: "pos_venda",
    channel: "whatsapp",
    customerId: null,
    customerName: "João",
    vehicleModel: "Corolla",
    phoneMasked: "*******12",
    reason: "Lavação concluída hoje",
    draftText: "Oi João!",
    finalText: null,
    status: "aprovada",
    approvedByName: "Robério",
    approvedAt: "2026-08-24T10:00:00.000Z",
    discardedByName: null,
    discardedAt: null,
    sentAt: null,
    sendResult: null,
    provider: null,
    externalMessageId: null,
    createdAt: "2026-08-24T09:00:00.000Z",
    ...overrides,
  };
}

describe("whatsappCloudApiChannel.send — fail closed", () => {
  it("teste obrigatório 1 — WHATSAPP_ENABLED ausente/false: nunca envia, nunca chama fetch", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const outcome = await whatsappCloudApiChannel.send(buildMessage());
    expect(outcome.success).toBe(false);
    expect(outcome.result).toMatch(/desabilitado|credenciais incompletas/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("teste obrigatório 4 — mensagem em rascunho: nunca envia, mesmo com tudo habilitado", async () => {
    enableWithValidConfig();
    const fetchSpy = vi.spyOn(global, "fetch");
    const outcome = await whatsappCloudApiChannel.send(buildMessage({ status: "rascunho" }));
    expect(outcome.success).toBe(false);
    expect(outcome.result).toMatch(/não está com status 'aprovada'/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolveRecipientPhoneMock).not.toHaveBeenCalled();
  });

  it("teste obrigatório 5 — mensagem descartada: nunca envia", async () => {
    enableWithValidConfig();
    const fetchSpy = vi.spyOn(global, "fetch");
    const outcome = await whatsappCloudApiChannel.send(buildMessage({ status: "descartada" }));
    expect(outcome.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("teste obrigatório 6 — mensagem aprovada chega ao adapter (passa da checagem de status até a resolução de telefone)", async () => {
    enableWithValidConfig();
    resolveRecipientPhoneMock.mockResolvedValue(null);
    await whatsappCloudApiChannel.send(buildMessage({ status: "aprovada", customerId: "cust-1" }));
    expect(resolveRecipientPhoneMock).toHaveBeenCalledWith("cust-1");
  });

  it("teste obrigatório 7 — telefone não resolvido (cliente sem telefone válido): nunca envia", async () => {
    enableWithValidConfig();
    resolveRecipientPhoneMock.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(global, "fetch");
    const outcome = await whatsappCloudApiChannel.send(buildMessage({ customerId: "cust-1" }));
    expect(outcome.success).toBe(false);
    expect(outcome.result).toMatch(/telefone.*não pôde ser resolvido/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fora da janela de 24h e sem template aprovado ("requer_template"): nunca envia', async () => {
    enableWithValidConfig();
    resolveRecipientPhoneMock.mockResolvedValue("+5511999998888");
    getLastInboundMessageAtMock.mockResolvedValue(null); // nenhuma mensagem recebida -> sempre requer_template
    const fetchSpy = vi.spyOn(global, "fetch");
    const outcome = await whatsappCloudApiChannel.send(buildMessage({ customerId: "cust-1" }));
    expect(outcome.success).toBe(false);
    expect(outcome.result).toMatch(/janela de 24h|template/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("teste obrigatório 20 — caminho legítimo completo: só aqui o fetch é de fato chamado, exatamente uma vez", async () => {
    enableWithValidConfig();
    resolveRecipientPhoneMock.mockResolvedValue("+5511999998888");
    getLastInboundMessageAtMock.mockResolvedValue(new Date()); // dentro da janela de 24h
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.XYZ" }] }), { status: 200 }));

    const outcome = await whatsappCloudApiChannel.send(buildMessage({ customerId: "cust-1" }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outcome.success).toBe(true);
    expect(outcome.externalMessageId).toBe("wamid.XYZ");
  });

  it("teste obrigatório 10 — o access token nunca aparece em nenhum resultado retornado, em nenhum cenário (sucesso ou falha)", async () => {
    process.env.WHATSAPP_ENABLED = "false";
    process.env.WHATSAPP_ACCESS_TOKEN = SENTINEL_TOKEN;
    const disabledOutcome = await whatsappCloudApiChannel.send(buildMessage());
    expect(disabledOutcome.result).not.toContain(SENTINEL_TOKEN);

    enableWithValidConfig();
    resolveRecipientPhoneMock.mockResolvedValue(null);
    const notFoundOutcome = await whatsappCloudApiChannel.send(buildMessage({ customerId: "cust-1" }));
    expect(notFoundOutcome.result).not.toContain(SENTINEL_TOKEN);

    resolveRecipientPhoneMock.mockResolvedValue("+5511999998888");
    getLastInboundMessageAtMock.mockResolvedValue(new Date());
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("erro", { status: 401 }));
    const httpErrorOutcome = await whatsappCloudApiChannel.send(buildMessage({ customerId: "cust-1" }));
    expect(httpErrorOutcome.result).not.toContain(SENTINEL_TOKEN);
  });
});

describe("checklist de completude — teste obrigatório 17: MANUAL_APPROVAL continua o padrão nesta missão", () => {
  it("getAutonomyLevel() continua MANUAL_APPROVAL — nenhum código de autonomia foi tocado por esta missão", async () => {
    expect(await getAutonomyLevel()).toBe("MANUAL_APPROVAL");
  });
});
