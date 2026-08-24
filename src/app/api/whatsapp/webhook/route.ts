import { NextResponse } from "next/server";
import { loadWhatsappCloudApiConfig } from "@/lib/integrations/whatsapp/config";
import { verifyWebhookSubscription, verifyMetaWebhookSignature, parseInboundWhatsAppPayload } from "@/lib/integrations/whatsapp/webhook";
import { normalizeBrazilianPhoneToE164 } from "@/lib/integrations/whatsapp/phone";
import { recordInboundMessage } from "@/lib/management/inboundMessages";

/**
 * Missão Z6.2 (seção 8) — endpoint do webhook oficial da Meta. Rota pública (ver `PUBLIC_PATHS` em
 * `middleware.ts`, mesmo padrão de `/api/jumppark/sync`/`/api/stone/sync`, que usam `CRON_SECRET`
 * no lugar de Basic Auth) — a autenticação aqui é a própria assinatura da Meta
 * (`X-Hub-Signature-256`), nunca Basic Auth.
 *
 * Enquanto `WHATSAPP_ENABLED` não for `true` (ou faltar qualquer credencial),
 * `loadWhatsappCloudApiConfig()` devolve `null` e a rota inteira responde 404 — nenhuma
 * verificação de assinatura sequer é tentada, nenhum payload é lido além do necessário.
 *
 * Nenhuma mensagem recebida aciona qualquer ação administrativa aqui — só grava em
 * `inbound_messages` (idempotente por `externalMessageId`). Resolver um `actor` administrativo a
 * partir do remetente (`resolveAdminActorFromPhone`) e agir sobre isso é trabalho de uma missão
 * futura, deliberadamente não conectado agora.
 */

export async function GET(request: Request) {
  const config = loadWhatsappCloudApiConfig();
  if (!config) {
    return new NextResponse("WhatsApp Cloud API não está habilitado neste ambiente.", { status: 404 });
  }

  const url = new URL(request.url);
  const challenge = verifyWebhookSubscription(
    {
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    },
    config.webhookVerifyToken,
  );

  if (!challenge) {
    return new NextResponse("Token de verificação inválido.", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const config = loadWhatsappCloudApiConfig();
  if (!config) {
    return new NextResponse("WhatsApp Cloud API não está habilitado neste ambiente.", { status: 404 });
  }

  // Corpo BRUTO, nunca `request.json()` direto — a assinatura é calculada sobre os bytes exatos recebidos.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaWebhookSignature(rawBody, signature, config.appSecret)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido (JSON malformado)." }, { status: 400 });
  }

  const parsedMessages = parseInboundWhatsAppPayload(body);
  for (const parsed of parsedMessages) {
    const phoneE164 = normalizeBrazilianPhoneToE164(parsed.phoneRaw);
    if (!phoneE164) continue; // nunca persiste um telefone que não conseguimos validar

    await recordInboundMessage({
      phoneE164,
      externalMessageId: parsed.externalMessageId,
      messageType: parsed.type,
      textBody: parsed.textBody,
      receivedAt: parsed.receivedAt,
    });
  }

  // A Meta exige 200 rápido mesmo quando o payload não tinha mensagem relevante (ex.: eventos de status/entrega).
  return NextResponse.json({ status: "ok" });
}
