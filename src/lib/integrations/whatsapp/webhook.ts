import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Missão Z6.2 (seção 8) — verificação do webhook oficial da Meta. Mesmo padrão de
 * `src/lib/integrations/stone/pix.ts` (`verifyStonePixWebhookAuth`): comparação em tempo
 * constante (`timingSafeEqual`), nunca `===` direto em segredo; qualquer formato inesperado
 * devolve `false`/`null`, nunca lança. Puro — nenhuma função aqui faz I/O; a rota
 * (`src/app/api/whatsapp/webhook/route.ts`) é quem chama isto e decide o que persistir.
 */

const SIGNATURE_HEADER_PREFIX = "sha256=";

/**
 * GET de verificação (documentação oficial da Meta): `hub.mode=subscribe` +
 * `hub.verify_token=<token cadastrado no painel Meta>` + `hub.challenge=<valor a ecoar>`. Devolve
 * o challenge exatamente como recebido quando válido, ou `null` quando o token não bate ou o modo
 * não é "subscribe" — a rota deve responder 403 nesse caso, nunca ecoar um challenge não validado.
 */
export function verifyWebhookSubscription(
  params: { mode: string | null; token: string | null; challenge: string | null },
  expectedVerifyToken: string,
): string | null {
  if (!params.mode || !params.token || !params.challenge || !expectedVerifyToken) return null;
  if (params.mode !== "subscribe") return null;

  const receivedBuffer = Buffer.from(params.token, "utf-8");
  const expectedBuffer = Buffer.from(expectedVerifyToken, "utf-8");
  if (receivedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

  return params.challenge;
}

/**
 * Assinatura do POST: header `X-Hub-Signature-256: sha256=<hmac-sha256 hex do corpo bruto>`,
 * calculada com o `WHATSAPP_APP_SECRET`. Precisa do corpo BRUTO (antes de `JSON.parse`) — a rota
 * é responsável por ler `request.text()` primeiro, nunca `request.json()` diretamente.
 */
export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null | undefined, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  if (!signatureHeader.startsWith(SIGNATURE_HEADER_PREFIX)) return false;

  const received = signatureHeader.slice(SIGNATURE_HEADER_PREFIX.length);
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf-8").digest("hex");

  const receivedBuffer = Buffer.from(received, "utf-8");
  const expectedBuffer = Buffer.from(expected, "utf-8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export interface ParsedInboundMessage {
  phoneRaw: string;
  externalMessageId: string;
  type: string;
  textBody: string | null;
  receivedAt: Date;
  /**
   * Missão Z6.6 (seção 9, prevenção de loop) — `value.metadata.display_phone_number`: o próprio
   * número comercial, reportado pela Meta em CADA evento. Nunca `null` por omissão quando o campo
   * vem preenchido — compare com `phoneRaw` para nunca tratar uma mensagem como se tivesse vindo
   * de um cliente/admin quando na verdade veio (ou parece ter vindo) do próprio número da empresa.
   */
  businessPhoneRaw: string | null;
}

/**
 * Extrai as mensagens de um payload de webhook da Meta (formato documentado: `entry[].changes[].
 * value.messages[]`). Nunca lança em formato inesperado — devolve lista vazia. Nunca inclui nada
 * além do que a Meta reportou (nenhum dado inventado); mensagens sem `type`/`from`/`id` válidos
 * são descartadas silenciosamente, não viram registro incompleto.
 */
export function parseInboundWhatsAppPayload(body: unknown): ParsedInboundMessage[] {
  if (typeof body !== "object" || body === null) return [];
  const entries = (body as Record<string, unknown>).entry;
  if (!Array.isArray(entries)) return [];

  const results: ParsedInboundMessage[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const value = (change as Record<string, unknown>).value;
      if (typeof value !== "object" || value === null) continue;
      const messages = (value as Record<string, unknown>).messages;
      if (!Array.isArray(messages)) continue;

      const metadata = (value as Record<string, unknown>).metadata;
      const businessPhoneRaw =
        typeof metadata === "object" && metadata !== null && typeof (metadata as Record<string, unknown>).display_phone_number === "string"
          ? ((metadata as Record<string, unknown>).display_phone_number as string)
          : null;

      for (const message of messages) {
        if (typeof message !== "object" || message === null) continue;
        const m = message as Record<string, unknown>;
        const from = typeof m.from === "string" ? m.from : null;
        const id = typeof m.id === "string" ? m.id : null;
        const type = typeof m.type === "string" ? m.type : null;
        const timestampRaw = typeof m.timestamp === "string" ? Number.parseInt(m.timestamp, 10) : null;
        if (!from || !id || !type || !timestampRaw || Number.isNaN(timestampRaw)) continue;

        let textBody: string | null = null;
        if (type === "text" && typeof m.text === "object" && m.text !== null) {
          const textField = (m.text as Record<string, unknown>).body;
          if (typeof textField === "string") textBody = textField;
        }

        results.push({
          phoneRaw: from,
          externalMessageId: id,
          type,
          textBody,
          receivedAt: new Date(timestampRaw * 1000),
          businessPhoneRaw,
        });
      }
    }
  }

  return results;
}

export interface ParsedStatusUpdateError {
  code: number | null;
  title: string | null;
  message: string | null;
  href: string | null;
  errorData: unknown;
}

export interface ParsedStatusUpdate {
  /** wamid da mensagem de SAÍDA a que este status se refere — corresponde a `externalMessageId` em `whatsapp_outbound_replies`, nunca ao wamid de um inbound. */
  wamid: string;
  /** Valor bruto reportado pela Meta ("sent"/"delivered"/"read"/"failed" documentados — string livre aqui, a validação contra o enum fica em `recordDeliveryStatusUpdate`, nunca aqui). */
  status: string;
  recipientId: string | null;
  timestamp: Date | null;
  conversationId: string | null;
  pricingCategory: string | null;
  errors: ParsedStatusUpdateError[];
}

/**
 * Missão Z6.7 — extrai `value.statuses[]` (documentação oficial da Meta, confirmada nesta missão:
 * `{id, status, timestamp, recipient_id, conversation:{id,...}, pricing:{category,...},
 * errors?:[{code,title,message,href,error_data}]}`). Independente de `parseInboundWhatsAppPayload`
 * — os dois percorrem a mesma árvore `entry[].changes[].value`, mas cada um só olha o array que
 * lhe interessa; um POST real da Meta pode conter `messages` e `statuses` na mesma `value`, e
 * processar um nunca impede o outro (nenhum `continue`/retorno cruzado entre as duas funções).
 * Nunca lança em formato inesperado — item sem `id`/`status` é descartado silenciosamente (não há
 * o que correlacionar sem os dois).
 */
export function parseWhatsAppStatusUpdates(body: unknown): ParsedStatusUpdate[] {
  if (typeof body !== "object" || body === null) return [];
  const entries = (body as Record<string, unknown>).entry;
  if (!Array.isArray(entries)) return [];

  const results: ParsedStatusUpdate[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const value = (change as Record<string, unknown>).value;
      if (typeof value !== "object" || value === null) continue;
      const statuses = (value as Record<string, unknown>).statuses;
      if (!Array.isArray(statuses)) continue;

      for (const statusEntry of statuses) {
        if (typeof statusEntry !== "object" || statusEntry === null) continue;
        const s = statusEntry as Record<string, unknown>;
        const wamid = typeof s.id === "string" ? s.id : null;
        const status = typeof s.status === "string" ? s.status : null;
        if (!wamid || !status) continue;

        const recipientId = typeof s.recipient_id === "string" ? s.recipient_id : null;
        const timestampRaw = typeof s.timestamp === "string" ? Number.parseInt(s.timestamp, 10) : null;
        const timestamp = timestampRaw !== null && !Number.isNaN(timestampRaw) ? new Date(timestampRaw * 1000) : null;

        const conversation = s.conversation;
        const conversationId =
          typeof conversation === "object" && conversation !== null && typeof (conversation as Record<string, unknown>).id === "string"
            ? ((conversation as Record<string, unknown>).id as string)
            : null;

        const pricing = s.pricing;
        const pricingCategory =
          typeof pricing === "object" && pricing !== null && typeof (pricing as Record<string, unknown>).category === "string"
            ? ((pricing as Record<string, unknown>).category as string)
            : null;

        const errorsRaw = Array.isArray(s.errors) ? s.errors : [];
        const errors: ParsedStatusUpdateError[] = errorsRaw.map((e) => {
          if (typeof e !== "object" || e === null) return { code: null, title: null, message: null, href: null, errorData: null };
          const err = e as Record<string, unknown>;
          return {
            code: typeof err.code === "number" ? err.code : null,
            title: typeof err.title === "string" ? err.title : null,
            message: typeof err.message === "string" ? err.message : null,
            href: typeof err.href === "string" ? err.href : null,
            errorData: err.error_data ?? null,
          };
        });

        results.push({ wamid, status, recipientId, timestamp, conversationId, pricingCategory, errors });
      }
    }
  }

  return results;
}
