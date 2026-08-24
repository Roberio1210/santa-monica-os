/**
 * Missão Z6.2 (seção 15) — a WhatsApp Cloud API só permite enviar texto livre dentro da janela de
 * 24h de uma conversa iniciada pelo cliente ("session message"); fora dessa janela, só um
 * "template message" pré-aprovado pela Meta pode ser enviado. Nenhum template foi aprovado até
 * hoje — `APPROVED_TEMPLATES` começa e permanece vazio nesta missão, nunca preenchido com um nome
 * inventado. Quando `resolveMessageWindow` cair em `"requer_template"` e não houver nenhum
 * template cadastrado, o envio deve bloquear e informar — nunca assumir um template aprovado.
 */
export interface WhatsAppTemplateRef {
  name: string;
  language: string;
}

/** Vazio por decisão explícita — só um cadastro real e verificado poderá adicionar um item aqui. */
export const APPROVED_TEMPLATES: WhatsAppTemplateRef[] = [];

export function findApprovedTemplate(name: string): WhatsAppTemplateRef | null {
  return APPROVED_TEMPLATES.find((t) => t.name === name) ?? null;
}

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Pura. `lastInboundAt` é o horário da última mensagem recebida do cliente (via
 * `getLastInboundMessageAt`) — `null` quando o cliente nunca escreveu (ou não temos registro),
 * o que sempre exige template, nunca session message por omissão.
 */
export function resolveMessageWindow(lastInboundAt: Date | null, now: Date): "sessao" | "requer_template" {
  if (!lastInboundAt) return "requer_template";
  return now.getTime() - lastInboundAt.getTime() <= SESSION_WINDOW_MS ? "sessao" : "requer_template";
}
