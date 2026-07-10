import type { IntegrationMeta } from "../types";

/**
 * Adaptador futuro para WhatsApp Business.
 * Nenhuma mensagem real é enviada nesta fase.
 */
export const whatsappIntegration: IntegrationMeta = {
  id: "whatsapp",
  name: "WhatsApp Business",
  description: "Agendamentos, confirmações e relacionamento com clientes.",
  source: "WhatsApp Business Platform (Meta)",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura de conversas relevantes", "Envio de mensagens com aprovação humana"],
  risks: ["Nenhuma mensagem será enviada automaticamente sem confirmação do proprietário."],
  dependencies: ["Número comercial verificado", "Conta WhatsApp Business API"],
  envVars: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"],
};

export function isWhatsappConfigured(): boolean {
  return false;
}
