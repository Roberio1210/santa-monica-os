import "server-only";
import type { WhatsAppCloudApiConfig } from "./config";

/**
 * Missão Z6.6 — extraída de `cloudApiChannel.ts` (Z6.2): o ÚNICO ponto de código que faz a
 * chamada HTTP real à Graph API da Meta. Usada por dois caminhos com governança diferente —
 * `whatsappCloudApiChannel.send()` (canal aprovado, `outbound_messages`/`assertMessageApproved`,
 * Missão "Regra Absoluta de Envio") e a resposta conversacional do WhatsApp administrativo
 * (`whatsappConversation.ts`) — para nunca duplicar a integração oficial. Nenhum dos dois
 * caminhos decide AQUI se pode enviar; essa decisão já foi tomada antes de chegar aqui. Nunca
 * loga/expõe `config.accessToken`.
 */

const GRAPH_API_VERSION = "v21.0";

export interface WhatsAppSendOutcome {
  success: boolean;
  result: string;
  externalMessageId?: string;
}

export async function sendWhatsAppText(config: WhatsAppCloudApiConfig, phoneE164: string, text: string): Promise<WhatsAppSendOutcome> {
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
}
