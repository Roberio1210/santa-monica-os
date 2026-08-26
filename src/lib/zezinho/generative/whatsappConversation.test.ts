import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Missão Z6.6 — testes do adaptador `handleAdminConversationalMessage`: idempotência de saída
 * (teste 7), erro de envio tratado corretamente (teste 9), token nunca em log (teste 10), e a
 * garantia estrutural de que resposta conversacional (categoria A) nunca passa pelo gate de
 * aprovação de `outbound_messages` (categoria C, teste 5).
 */

const answerGenerativeMock = vi.fn();
vi.mock("@/lib/zezinho/generative/orchestrator", () => ({
  answerGenerative: (...args: unknown[]) => answerGenerativeMock(...args),
}));

const getConversationHistoryMock = vi.fn();
const findExistingReplyForInboundMock = vi.fn();
const recordOutboundReplyMock = vi.fn();
const updateOutboundReplyStatusMock = vi.fn();
vi.mock("@/lib/management/whatsappConversations", () => ({
  getConversationHistory: (...args: unknown[]) => getConversationHistoryMock(...args),
  findExistingReplyForInbound: (...args: unknown[]) => findExistingReplyForInboundMock(...args),
  recordOutboundReply: (...args: unknown[]) => recordOutboundReplyMock(...args),
  updateOutboundReplyStatus: (...args: unknown[]) => updateOutboundReplyStatusMock(...args),
}));

const resolveAdminActorFromPhoneMock = vi.fn();
vi.mock("@/lib/management/inboundMessages", () => ({
  resolveAdminActorFromPhone: (...args: unknown[]) => resolveAdminActorFromPhoneMock(...args),
}));

const loadWhatsappCloudApiConfigMock = vi.fn();
vi.mock("@/lib/integrations/whatsapp/config", () => ({
  loadWhatsappCloudApiConfig: (...args: unknown[]) => loadWhatsappCloudApiConfigMock(...args),
}));

const sendWhatsAppTextMock = vi.fn();
vi.mock("@/lib/integrations/whatsapp/sendText", () => ({
  sendWhatsAppText: (...args: unknown[]) => sendWhatsAppTextMock(...args),
}));

const SENTINEL_TOKEN = "SENTINEL_TOKEN_NUNCA_DEVE_APARECER_EM_LOG";
const ACTOR = { id: "user-1", name: "Robério" };

beforeEach(() => {
  answerGenerativeMock.mockReset();
  getConversationHistoryMock.mockReset().mockResolvedValue([]);
  findExistingReplyForInboundMock.mockReset().mockResolvedValue(null);
  recordOutboundReplyMock.mockReset();
  updateOutboundReplyStatusMock.mockReset();
  resolveAdminActorFromPhoneMock.mockReset().mockResolvedValue({ ...ACTOR, role: "admin" });
  loadWhatsappCloudApiConfigMock.mockReset();
  sendWhatsAppTextMock.mockReset();
});

describe("handleAdminConversationalMessage", () => {
  it("sem texto (tipo não suportado) -> não gera nem tenta enviar nada", async () => {
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: null });
    expect(result.replied).toBe(false);
    expect(answerGenerativeMock).not.toHaveBeenCalled();
  });

  it("teste obrigatório 7 — evento já processado (idempotência de saída): não chama answerGenerative nem tenta enviar de novo", async () => {
    findExistingReplyForInboundMock.mockResolvedValue({ id: "reply-1", status: "accepted", phoneE164: "+5548991741102", content: "oi", triggeredByExternalMessageId: "wamid.1", externalMessageId: "wamid.OUT", sendResult: "ok" });
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "oi" });

    expect(result).toEqual({ replied: true, reason: "já processado anteriormente (idempotência de saída)", outboundReplyId: "reply-1", toolsCalled: [] });
    expect(answerGenerativeMock).not.toHaveBeenCalled();
    expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
  });

  it("modo generativo indisponível (flag desligada/provider falhou) -> não cria linha de resposta, nunca tenta enviar", async () => {
    answerGenerativeMock.mockResolvedValue(null);
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "oi" });
    expect(result.replied).toBe(false);
    expect(recordOutboundReplyMock).not.toHaveBeenCalled();
  });

  it("answerGenerative é chamado com toolPolicy 'conversational_read_only' e o role real do remetente (admin)", async () => {
    answerGenerativeMock.mockResolvedValue({ text: "resposta", toolsCalled: [] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-2" });
    loadWhatsappCloudApiConfigMock.mockReturnValue(null);
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "Zezinho, como foi o dia?" });

    expect(answerGenerativeMock).toHaveBeenCalledWith("Zezinho, como foi o dia?", [], "admin", ACTOR, "conversational_read_only");
  });

  it("Missão de menor privilégio (gerente) — quando o telefone resolve para role 'operacional', answerGenerative é chamado com 'operacional', NUNCA 'admin' fixo", async () => {
    resolveAdminActorFromPhoneMock.mockResolvedValue({ id: "user-2", name: "Vinicius Anacleto", role: "operacional" });
    answerGenerativeMock.mockResolvedValue({ text: "resposta", toolsCalled: [] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-2b" });
    loadWhatsappCloudApiConfigMock.mockReturnValue(null);
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    await handleAdminConversationalMessage({ phoneE164: "+5548998161302", actor: { id: "user-2", name: "Vinicius Anacleto" }, inboundExternalMessageId: "wamid.1", textBody: "Zezinho, quanto temos de V-Floc?" });

    expect(answerGenerativeMock).toHaveBeenCalledWith("Zezinho, quanto temos de V-Floc?", [], "operacional", { id: "user-2", name: "Vinicius Anacleto" }, "conversational_read_only");
  });

  it("remetente não resolve mais nenhum actor logo no início do processamento (allowlist mudou entre a checagem do chamador e agora) -> bloqueia antes de gerar qualquer resposta", async () => {
    resolveAdminActorFromPhoneMock.mockResolvedValue(null);
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "oi" });

    expect(result.replied).toBe(false);
    expect(answerGenerativeMock).not.toHaveBeenCalled();
    expect(recordOutboundReplyMock).not.toHaveBeenCalled();
  });

  it("WHATSAPP_ENABLED desabilitado (config null) -> resposta é gerada e registrada, mas não enviada", async () => {
    answerGenerativeMock.mockResolvedValue({ text: "resposta gerada", toolsCalled: [] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-3" });
    loadWhatsappCloudApiConfigMock.mockReturnValue(null);
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "oi" });

    expect(result.replied).toBe(false);
    expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
    expect(updateOutboundReplyStatusMock).toHaveBeenCalledWith("reply-3", expect.objectContaining({ status: "envio_desabilitado" }));
  });

  it("defesa em profundidade — destinatário não está mais na allowlist no momento do envio -> bloqueia mesmo com config presente", async () => {
    answerGenerativeMock.mockResolvedValue({ text: "resposta", toolsCalled: [] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-4" });
    loadWhatsappCloudApiConfigMock.mockReturnValue({ phoneNumberId: "p", businessAccountId: "b", accessToken: SENTINEL_TOKEN, webhookVerifyToken: "v", appSecret: "s" });
    // 1ª chamada (início do processamento, resolve o role real) ainda encontra o admin; só a 2ª
    // chamada (defesa em profundidade, imediatamente antes do envio) já não encontra mais —
    // simula a allowlist mudando NO MEIO do processamento (ex.: desativado enquanto o modelo gerava a resposta).
    resolveAdminActorFromPhoneMock.mockResolvedValueOnce({ ...ACTOR, role: "admin" }).mockResolvedValueOnce(null);
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "oi" });

    expect(result.replied).toBe(false);
    expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
    expect(updateOutboundReplyStatusMock).toHaveBeenCalledWith("reply-4", expect.objectContaining({ status: "falha_envio" }));
  });

  it("caminho feliz completo — gera, registra, reconfirma allowlist e envia de verdade", async () => {
    answerGenerativeMock.mockResolvedValue({ text: "Recomendo a Vitrificação Premium.", toolsCalled: ["service_catalog_search"] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-5" });
    loadWhatsappCloudApiConfigMock.mockReturnValue({ phoneNumberId: "p", businessAccountId: "b", accessToken: SENTINEL_TOKEN, webhookVerifyToken: "v", appSecret: "s" });
    sendWhatsAppTextMock.mockResolvedValue({ success: true, result: "Mensagem enviada com sucesso via WhatsApp Cloud API.", externalMessageId: "wamid.OUT1" });
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "qual vitrificação você recomenda?" });

    expect(result).toEqual({ replied: true, reason: "Mensagem enviada com sucesso via WhatsApp Cloud API.", outboundReplyId: "reply-5", toolsCalled: ["service_catalog_search"] });
    expect(sendWhatsAppTextMock).toHaveBeenCalledWith(expect.objectContaining({ accessToken: SENTINEL_TOKEN }), "+5548991741102", "Recomendo a Vitrificação Premium.");
    expect(updateOutboundReplyStatusMock).toHaveBeenCalledWith("reply-5", expect.objectContaining({ status: "accepted", externalMessageId: "wamid.OUT1" }));
  });

  it("teste obrigatório 9 — erro no envio da Meta é tratado corretamente: não lança, registra falha_envio, replied:false", async () => {
    answerGenerativeMock.mockResolvedValue({ text: "resposta", toolsCalled: [] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-6" });
    loadWhatsappCloudApiConfigMock.mockReturnValue({ phoneNumberId: "p", businessAccountId: "b", accessToken: SENTINEL_TOKEN, webhookVerifyToken: "v", appSecret: "s" });
    sendWhatsAppTextMock.mockResolvedValue({ success: false, result: "Falha no envio via WhatsApp Cloud API (HTTP 401)." });
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");
    const result = await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.1", textBody: "oi" });

    expect(result.replied).toBe(false);
    expect(result.reason).toContain("401");
    expect(updateOutboundReplyStatusMock).toHaveBeenCalledWith("reply-6", expect.objectContaining({ status: "falha_envio" }));
  });

  it("teste obrigatório 10 — o token nunca aparece em nenhum log, em nenhum cenário (desabilitado, bloqueado, sucesso, falha)", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = { phoneNumberId: "p", businessAccountId: "b", accessToken: SENTINEL_TOKEN, webhookVerifyToken: "v", appSecret: "s" };
    const { handleAdminConversationalMessage } = await import("@/lib/zezinho/generative/whatsappConversation");

    answerGenerativeMock.mockResolvedValue({ text: "resposta", toolsCalled: [] });
    recordOutboundReplyMock.mockResolvedValue({ id: "reply-7" });

    loadWhatsappCloudApiConfigMock.mockReturnValue(null);
    await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.A", textBody: "oi" });

    loadWhatsappCloudApiConfigMock.mockReturnValue(config);
    sendWhatsAppTextMock.mockResolvedValue({ success: true, result: "Mensagem enviada com sucesso via WhatsApp Cloud API.", externalMessageId: "wamid.OUT" });
    await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.B", textBody: "oi" });

    sendWhatsAppTextMock.mockResolvedValue({ success: false, result: "Falha no envio (HTTP 500)." });
    await handleAdminConversationalMessage({ phoneE164: "+5548991741102", actor: ACTOR, inboundExternalMessageId: "wamid.C", textBody: "oi" });

    const logged = consoleSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain(SENTINEL_TOKEN);
    consoleSpy.mockRestore();
  });
});

describe("Missão Z6.6 (teste obrigatório 5) — resposta conversacional nunca passa pelo gate de aprovação de outbound_messages", () => {
  it("whatsappConversation.ts nunca importa/chama assertMessageApproved, sendApprovedOutboundMessage ou o fluxo de outbound_messages (fora de comentários explicativos)", () => {
    const source = readFileSync(new URL("./whatsappConversation.ts", import.meta.url), "utf-8");
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    for (const forbidden of ["assertMessageApproved", "sendApprovedOutboundMessage", "queueMessageForApproval", '"@/lib/management/outboundMessages"']) {
      expect(codeOnly).not.toContain(forbidden);
    }
  });
});
