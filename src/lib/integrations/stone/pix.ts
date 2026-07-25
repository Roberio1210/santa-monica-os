import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RegisterWebhookInput } from "@/lib/integrations/stone/client";
import type { StoneWebhookNotificationPayload } from "@/lib/integrations/stone/types";

/**
 * Fluxo Pix (Sprint 7.0, Z4) — decisão do usuário, seção 13: auditar a documentação oficial do
 * webhook antes de publicar qualquer rota pública, e nunca aceitar evento Pix sem autenticação
 * verificável. Reaudição feita neste checkpoint diretamente contra
 * https://conciliacao.stone.com.br/reference/notificação-via-webhook e
 * .../reference/cadastro-de-webhook (documentação oficial, não suposição):
 *
 * - Cadastro do webhook: `POST /v2/webhook` com `{ url, headers }` — o campo `headers` é onde
 *   PODEMOS anexar um segredo próprio; a Stone valida a URL uma única vez no cadastro (POST
 *   `{"type":"validation_notification"}`, exige 2xx em até 3s) e depois chama essa URL sempre que
 *   um arquivo Pix fica pronto.
 * - Notificação: `POST` para a URL cadastrada com `{ type: "pix", url, document, referenceDate }`
 *   — **sem nenhum campo de assinatura, HMAC ou nonce**. A doc não documenta política de retry
 *   nem allowlist de IP. Não existe ambiente de homologação para validar nada disso.
 *
 * Achado crítico: a Stone **não assina** a notificação. A única forma de autenticação
 * verificável disponível é um segredo que NÓS escolhemos e registramos no campo `headers` do
 * cadastro — a Stone então ecoa esse header em toda chamada futura, funcionando como um bearer
 * token que só nós e a Stone conhecemos. Isso é suficiente para "autenticação verificável" (rejeita
 * qualquer chamador que não conheça o segredo), mas não protege contra replay (não há nonce/
 * timestamp no payload) nem garante retry idempotente documentado.
 *
 * Decisão (seção 13, fallback pré-autorizado pelo usuário): **nenhuma rota pública é publicada
 * neste checkpoint.** Este arquivo é só o contrato — tipos, geração/verificação do segredo,
 * serviço interno pronto — para quando uma decisão de infraestrutura (endpoint público, HTTPS,
 * DNS) for tomada explicitamente com o usuário.
 */

export type StonePixWebhookStatus = "aguardando_configuracao";

export const STONE_PIX_WEBHOOK_STATUS: StonePixWebhookStatus = "aguardando_configuracao";

export const STONE_PIX_WEBHOOK_STATUS_MESSAGE =
  "Fluxo Pix preparado (contrato, tipos, serviço interno), mas aguardando configuração: nenhuma rota pública foi publicada porque a Stone não assina a notificação do webhook, e a documentação oficial não descreve proteção contra replay nem política de retry.";

const SIGNATURE_HEADER_NAME = "x-santa-monica-pix-secret";

/** Header a registrar em `client.ts:registerWebhook` quando o cadastro for autorizado — nunca chamado automaticamente. */
export function buildPixWebhookRegistrationInput(callbackUrl: string, sharedSecret: string): RegisterWebhookInput {
  return { url: callbackUrl, headers: { [SIGNATURE_HEADER_NAME]: sharedSecret } };
}

/**
 * Verifica se uma requisição recebida carrega o segredo esperado — comparação em tempo
 * constante (`timingSafeEqual`), nunca `===` direto em segredo. `true` só quando o header bate
 * exatamente com o segredo configurado; qualquer ausência/formato inválido é `false`, nunca lança.
 */
export function verifyStonePixWebhookAuth(headers: Record<string, string | null | undefined>, expectedSecret: string): boolean {
  const received = headers[SIGNATURE_HEADER_NAME];
  if (!received || !expectedSecret) return false;

  const receivedBuffer = Buffer.from(received, "utf-8");
  const expectedBuffer = Buffer.from(expectedSecret, "utf-8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

/** Deriva um segredo determinístico a partir da API key Stone — evita precisar de mais uma variável de ambiente só para isto, sem nunca reutilizar a chave diretamente como segredo do webhook. */
export function derivePixWebhookSecret(stoneApiKey: string): string {
  return createHmac("sha256", stoneApiKey).update("santa-monica-os:pix-webhook").digest("hex");
}

export interface PixNotificationValidationResult {
  valid: boolean;
  reason: string | null;
  payload: StoneWebhookNotificationPayload | null;
}

/**
 * Validação pura do payload de notificação — nunca faz download do arquivo nem qualquer I/O.
 * Pronta para ser chamada por uma futura rota receptora; hoje só usada pelos testes deste
 * contrato. Rejeita silenciosamente qualquer formato inesperado (nunca lança em payload não
 * confiável vindo de fora).
 */
export function validatePixNotificationPayload(body: unknown, headers: Record<string, string | null | undefined>, expectedSecret: string): PixNotificationValidationResult {
  if (!verifyStonePixWebhookAuth(headers, expectedSecret)) {
    return { valid: false, reason: "Autenticação do webhook ausente ou inválida.", payload: null };
  }
  if (typeof body !== "object" || body === null) {
    return { valid: false, reason: "Payload não é um objeto.", payload: null };
  }
  const candidate = body as Record<string, unknown>;
  if (candidate.type !== "pix" || typeof candidate.url !== "string" || typeof candidate.document !== "string" || typeof candidate.referenceDate !== "string") {
    return { valid: false, reason: "Payload não corresponde ao formato documentado (type/url/document/referenceDate).", payload: null };
  }
  return { valid: true, reason: null, payload: { type: "pix", url: candidate.url, document: candidate.document, referenceDate: candidate.referenceDate } };
}
