import "server-only";
import type { MessageChannel, OutboundMessageRecord } from "@/lib/management/outboundMessages";
import { loadWhatsappCloudApiConfig } from "./config";
import { resolveRecipientPhone } from "./recipientResolution";
import { resolveMessageWindow, findApprovedTemplate } from "./templates";
import { getLastInboundMessageAt } from "@/lib/management/inboundMessages";

/**
 * Missão Z6.2 — implementação real do `MessageChannel` para a WhatsApp Cloud API oficial da Meta.
 * FAIL CLOSED em cada uma das 4 condições da missão, nesta ordem, e NUNCA chega ao `fetch()` real
 * se qualquer uma falhar:
 *   1. `WHATSAPP_ENABLED !== "true"` OU alguma credencial obrigatória ausente (`loadWhatsappCloudApiConfig()` devolve `null`);
 *   2. `message.status !== "aprovada"` — defesa em profundidade; `sendApprovedOutboundMessage` já
 *      garante isso antes de chamar `channel.send()`, mas este canal nunca confia cegamente no chamador;
 *   3. destinatário não resolvido (sem `customerId`, sem telefone cadastrado, ou telefone inválido);
 *   4. fora da janela de 24h E nenhum template aprovado cadastrado (`templates.ts`).
 * Nenhum resultado devolvido por este módulo contém telefone completo ou credencial — só texto
 * seguro para log/auditoria (`outbound_messages.sendResult`).
 */

const GRAPH_API_VERSION = "v21.0";

export const whatsappCloudApiChannel: MessageChannel = {
  provider: "whatsapp_cloud_api",

  async send(message: OutboundMessageRecord) {
    const config = loadWhatsappCloudApiConfig();
    if (!config) {
      return { success: false, result: "WhatsApp Cloud API desabilitado ou com credenciais incompletas neste ambiente (WHATSAPP_ENABLED/credenciais) — envio bloqueado." };
    }

    if (message.status !== "aprovada") {
      return { success: false, result: "Mensagem não está com status 'aprovada' — envio recusado pelo próprio canal, independente de quem chamou." };
    }

    const phoneE164 = await resolveRecipientPhone(message.customerId);
    if (!phoneE164) {
      return { success: false, result: "Telefone do destinatário não pôde ser resolvido (sem cliente vinculado, sem telefone cadastrado, ou telefone inválido) — envio bloqueado." };
    }

    const lastInboundAt = await getLastInboundMessageAt(message.customerId);
    const window = resolveMessageWindow(lastInboundAt, new Date());
    // `message.kind` como chave de template é um placeholder honesto (um template por tipo de contato) — a
    // estratégia real de nomeação de template é decisão de uma missão futura, junto do primeiro cadastro real.
    if (window === "requer_template" && !findApprovedTemplate(message.kind)) {
      return { success: false, result: "Fora da janela de 24h de conversa e nenhum template aprovado pela Meta está cadastrado para este tipo de mensagem — envio bloqueado." };
    }

    const text = message.finalText ?? message.draftText;

    try {
      const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phoneE164,
          type: "text",
          text: { body: text },
        }),
      });

      if (!response.ok) {
        return { success: false, result: `Falha no envio via WhatsApp Cloud API (HTTP ${response.status}).` };
      }

      const data = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
      const externalMessageId = data?.messages?.[0]?.id;
      return { success: true, result: "Mensagem enviada com sucesso via WhatsApp Cloud API.", externalMessageId };
    } catch {
      return { success: false, result: "Erro de rede ao tentar enviar via WhatsApp Cloud API." };
    }
  },
};
