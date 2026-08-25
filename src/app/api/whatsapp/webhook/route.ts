import { NextResponse } from "next/server";
import { loadWebhookVerifyToken, loadWebhookAppSecret } from "@/lib/integrations/whatsapp/config";
import { verifyWebhookSubscription, verifyMetaWebhookSignature, parseInboundWhatsAppPayload } from "@/lib/integrations/whatsapp/webhook";
import { normalizeBrazilianPhoneToE164 } from "@/lib/integrations/whatsapp/phone";
import { recordInboundMessage } from "@/lib/management/inboundMessages";
import { resolveWhatsAppAdminActor } from "@/lib/zezinho/generative/orchestrator";
import { maskPhone } from "@/lib/utils/mask";

/**
 * Missão Z6.2 (seção 8) — endpoint do webhook oficial da Meta. Rota pública (ver `PUBLIC_PATHS` em
 * `middleware.ts`, mesmo padrão de `/api/jumppark/sync`/`/api/stone/sync`, que usam `CRON_SECRET`
 * no lugar de Basic Auth) — a autenticação aqui é a própria assinatura da Meta
 * (`X-Hub-Signature-256`), nunca Basic Auth.
 *
 * Missão Z6.3 (achado real desta missão, corrigido aqui) — GET e POST usam SÓ a configuração
 * mínima que cada um precisa (`loadWebhookVerifyToken`/`loadWebhookAppSecret`), nunca
 * `loadWhatsappCloudApiConfig()` (que exige `WHATSAPP_ENABLED=true` + as credenciais de envio).
 * Isso é o que permite a Meta confirmar a URL de callback na "Etapa 2" do painel SEM habilitar
 * envio real — a implementação anterior exigia `WHATSAPP_ENABLED=true` até para o GET de
 * verificação, o que teria forçado a habilitar envio só para validar o webhook. `WHATSAPP_ENABLED`
 * continua controlando exclusivamente o ENVIO (`cloudApiChannel.ts`), nunca o recebimento.
 *
 * GET: responde com base só no `WHATSAPP_WEBHOOK_VERIFY_TOKEN` configurado. Sem essa variável,
 * 404 (nada para verificar). Token errado, 403. Nunca revela o valor esperado em nenhuma resposta.
 *
 * POST: exige `WHATSAPP_APP_SECRET` configurado para processar qualquer evento — sem ele, 503
 * (fail closed: sem segredo não há como autenticar o remetente, então nenhum payload é sequer
 * lido além do necessário para responder). Com o segredo configurado, assinatura inválida -> 401.
 *
 * Nenhuma mensagem recebida aciona qualquer ação administrativa aqui — só grava em
 * `inbound_messages` (idempotente por `externalMessageId`) e loga se o remetente foi reconhecido
 * como admin. Nenhuma resposta automática é enviada ao cliente.
 *
 * Missão Z6.4 — observabilidade segura: cada mensagem persistida gera uma linha de log
 * estruturada (timestamp, provider, external_message_id, tipo, telefone MASCARADO, customer_id,
 * se foi inserção nova ou duplicata) — nunca o texto da mensagem, nunca o telefone completo, nunca
 * token/app secret.
 *
 * Missão Z6.5 — `resolveWhatsAppAdminActor` (orquestrador) agora resolve, a partir do telefone JÁ
 * VERIFICADO (assinatura validada acima, nunca do texto da mensagem), se o remetente é um admin
 * cadastrado em `whatsapp_admin_numbers`. O resultado só é LOGADO (`remetenteReconhecidoComoAdmin`)
 * — nada mais acontece a partir disso nesta missão: nenhuma chamada a `answerGenerative`, nenhuma
 * ferramenta, nenhuma resposta automática. Conectar isso a um fluxo de conversa real (o gestor de
 * fato interagindo com o Zézinho pelo WhatsApp) é trabalho de uma missão futura, explícita.
 */

export async function GET(request: Request) {
  const verifyToken = loadWebhookVerifyToken();
  if (!verifyToken) {
    return new NextResponse("Webhook não configurado neste ambiente (verify token ausente).", { status: 404 });
  }

  const url = new URL(request.url);
  const challenge = verifyWebhookSubscription(
    {
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    },
    verifyToken,
  );

  if (!challenge) {
    return new NextResponse("Token de verificação inválido.", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const appSecret = loadWebhookAppSecret();
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook ainda não está pronto para receber eventos (assinatura não configurada neste ambiente)." }, { status: 503 });
  }

  // Corpo BRUTO, nunca `request.json()` direto — a assinatura é calculada sobre os bytes exatos recebidos.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaWebhookSignature(rawBody, signature, appSecret)) {
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

    const record = await recordInboundMessage({
      phoneE164,
      externalMessageId: parsed.externalMessageId,
      messageType: parsed.type,
      textBody: parsed.textBody,
      receivedAt: parsed.receivedAt,
    });

    // Missão Z6.5 — só RESOLVE identidade (telefone verificado -> actor), nunca aciona nada a
    // partir disso: nenhuma chamada a `answerGenerative`, nenhuma ferramenta, nenhum envio. O
    // reconhecimento existe apenas para observabilidade nesta fase.
    const adminActor = await resolveWhatsAppAdminActor(record.phoneE164);

    // Missão Z6.4 — observabilidade segura: nunca loga texto da mensagem, telefone completo, token ou app secret.
    console.log(
      JSON.stringify({
        scope: "whatsapp-webhook-inbound",
        loggedAt: new Date().toISOString(),
        provider: "meta_whatsapp_cloud_api",
        externalMessageId: record.externalMessageId,
        messageType: record.messageType,
        phoneMasked: maskPhone(record.phoneE164),
        customerId: record.customerId,
        receivedAt: record.receivedAt,
        wasNewInsert: record.wasNewInsert,
        status: record.wasNewInsert ? "recebida_e_persistida" : "duplicada_ignorada_idempotencia",
        remetenteReconhecidoComoAdmin: adminActor !== null,
        adminActorId: adminActor?.id ?? null,
      }),
    );
  }

  // A Meta exige 200 rápido mesmo quando o payload não tinha mensagem relevante (ex.: eventos de status/entrega).
  return NextResponse.json({ status: "ok" });
}
