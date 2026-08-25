import "server-only";
import { answerGenerative, type GenerativeActor } from "@/lib/zezinho/generative/orchestrator";
import { getConversationHistory, findExistingReplyForInbound, recordOutboundReply, updateOutboundReplyStatus } from "@/lib/management/whatsappConversations";
import { resolveAdminActorFromPhone } from "@/lib/management/inboundMessages";
import { loadWhatsappCloudApiConfig } from "@/lib/integrations/whatsapp/config";
import { sendWhatsAppText } from "@/lib/integrations/whatsapp/sendText";
import { maskPhone } from "@/lib/utils/mask";

/**
 * Missão Z6.6 — CAMADA/ADAPTADOR DE CANAL para o WhatsApp administrativo, não um segundo Zézinho:
 * chama o MESMO `answerGenerative` da sessão Web (mesmo prompt, mesmo modelo, mesmas ferramentas
 * de leitura), só com `toolPolicy: "conversational_read_only"` (nenhuma ferramenta com efeito
 * colateral exposta) e histórico reconstruído de `whatsappConversations.ts` no lugar do histórico
 * mantido pelo cliente Web.
 *
 * SÓ é chamada pelo chamador (`route.ts`) quando o remetente já foi reconhecido como admin pelo
 * telefone verificado (`resolveWhatsAppAdminActor`) — número fora da allowlist nunca chega aqui.
 * Ainda assim, esta função reconfirma a allowlist no momento do envio (defesa em profundidade,
 * seção 6 da missão) — nunca confia cegamente que a checagem do chamador continua válida.
 *
 * Governança: "resposta conversacional para admin" (categoria A da missão) — nunca passa pelo
 * gate de `outbound_messages`/`assertMessageApproved` (categoria C, mensagens a clientes,
 * continua exigindo aprovação manual, intocada). As ferramentas com efeito colateral (categoria
 * B) já saem filtradas do modelo por `toolPolicy.ts`, então mesmo que o admin peça uma ação, o
 * modelo não tem como executá-la — só pode responder que não tem essa capacidade aqui.
 */

export interface ConversationalReplyOutcome {
  replied: boolean;
  reason: string;
  outboundReplyId: string | null;
  toolsCalled: string[];
}

function logPhase(phase: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: "whatsapp-conversational-reply", phase, loggedAt: new Date().toISOString(), ...fields }));
}

export async function handleAdminConversationalMessage(params: {
  phoneE164: string;
  actor: GenerativeActor;
  inboundExternalMessageId: string;
  textBody: string | null;
}): Promise<ConversationalReplyOutcome> {
  const start = Date.now();
  const phoneMasked = maskPhone(params.phoneE164);

  if (!params.textBody) {
    logPhase("bloqueado_tipo_nao_suportado", { phoneMasked, adminActorId: params.actor.id, durationMs: Date.now() - start });
    return { replied: false, reason: "mensagem sem texto (tipo ainda não suportado na conversa)", outboundReplyId: null, toolsCalled: [] };
  }

  // Idempotência de SAÍDA (seção 10): a mesma reentrega de webhook nunca gera uma segunda geração/envio.
  const existing = await findExistingReplyForInbound(params.inboundExternalMessageId);
  if (existing) {
    logPhase("duplicado_ja_processado", { phoneMasked, adminActorId: params.actor.id, outboundReplyId: existing.id, status: existing.status, durationMs: Date.now() - start });
    return { replied: existing.status === "enviada", reason: "já processado anteriormente (idempotência de saída)", outboundReplyId: existing.id, toolsCalled: [] };
  }

  logPhase("processamento_generativo_iniciado", { phoneMasked, adminActorId: params.actor.id });
  const history = await getConversationHistory(params.phoneE164);
  const generative = await answerGenerative(params.textBody, history, "admin", params.actor, "conversational_read_only");

  if (!generative) {
    logPhase("processamento_generativo_indisponivel", { phoneMasked, adminActorId: params.actor.id, durationMs: Date.now() - start });
    return { replied: false, reason: "modo generativo indisponível (flag desligada ou provider falhou)", outboundReplyId: null, toolsCalled: [] };
  }
  logPhase("processamento_generativo_concluido", { phoneMasked, adminActorId: params.actor.id, toolsCalled: generative.toolsCalled });

  const replyRow = await recordOutboundReply({
    phoneE164: params.phoneE164,
    content: generative.text,
    triggeredByExternalMessageId: params.inboundExternalMessageId,
  });

  const config = loadWhatsappCloudApiConfig();
  if (!config) {
    await updateOutboundReplyStatus(replyRow.id, { status: "envio_desabilitado", sendResult: "WhatsApp Cloud API desabilitado ou credenciais incompletas — resposta gerada, mas não enviada." });
    logPhase("outbound_bloqueado_desabilitado", { phoneMasked, adminActorId: params.actor.id, outboundReplyId: replyRow.id, durationMs: Date.now() - start });
    return { replied: false, reason: "resposta gerada, envio desabilitado (WHATSAPP_ENABLED/credenciais)", outboundReplyId: replyRow.id, toolsCalled: generative.toolsCalled };
  }

  // Defesa em profundidade (seção 6) — reconfirma a allowlist no momento do envio, nunca confia só na checagem do chamador.
  const stillAdmin = await resolveAdminActorFromPhone(params.phoneE164);
  if (!stillAdmin) {
    await updateOutboundReplyStatus(replyRow.id, { status: "falha_envio", sendResult: "Destinatário não está (ou não está mais) na allowlist administrativa — envio bloqueado." });
    logPhase("outbound_bloqueado_fora_da_allowlist", { phoneMasked, adminActorId: params.actor.id, outboundReplyId: replyRow.id, durationMs: Date.now() - start });
    return { replied: false, reason: "destinatário fora da allowlist administrativa no momento do envio — bloqueado", outboundReplyId: replyRow.id, toolsCalled: generative.toolsCalled };
  }

  logPhase("outbound_solicitado", { phoneMasked, adminActorId: params.actor.id, outboundReplyId: replyRow.id });
  const outcome = await sendWhatsAppText(config, params.phoneE164, generative.text);
  await updateOutboundReplyStatus(replyRow.id, {
    status: outcome.success ? "enviada" : "falha_envio",
    externalMessageId: outcome.externalMessageId ?? null,
    sendResult: outcome.result,
  });

  logPhase(outcome.success ? "outbound_enviado" : "outbound_falha", {
    phoneMasked,
    adminActorId: params.actor.id,
    outboundReplyId: replyRow.id,
    metaMessageId: outcome.externalMessageId ?? null,
    sendResult: outcome.result,
    durationMs: Date.now() - start,
  });

  return { replied: outcome.success, reason: outcome.result, outboundReplyId: replyRow.id, toolsCalled: generative.toolsCalled };
}
