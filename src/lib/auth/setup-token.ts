import { randomBytes } from "node:crypto";

/**
 * Missão 53 — extraído de `password.ts` (que continua com `import "server-only"`, correto para
 * `hashPassword`/`verifyPassword`, chamadas só de dentro do runtime do Next.js) porque esta função
 * é usada também por `src/db/seed/provision-user.ts`, um script de linha de comando (`tsx`) que
 * roda fora do Next.js — `server-only` lança erro em qualquer import fora do runtime de Server
 * Component (confirmado empiricamente). Função pura, sem nenhuma dependência do Next.js: não há
 * razão de segurança para a guarda aqui, só reexportada por `password.ts` para não quebrar nenhum
 * import existente.
 */
export function generateSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Validade do token de definição de primeira senha (Missão 53). Não existia nenhuma convenção de
 * expiração de token no projeto antes desta missão (`passwordSetupTokenExpiresAt` nunca chegou a
 * ser preenchido em produção) — 24h é um prazo razoável para a pessoa ver o link (ex. recebido por
 * WhatsApp) e definir a senha sem que o link fique aberto por dias. Centralizada aqui para nunca
 * espalhar o número mágico pelo código (script de provisionamento e qualquer futuro fluxo de
 * reset usam esta mesma constante).
 */
export const PASSWORD_SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
