import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema/auth";
import { userRoles, type UserRole } from "@/lib/auth/roles";
import { generateSetupToken, PASSWORD_SETUP_TOKEN_TTL_MS } from "@/lib/auth/setup-token";

/**
 * Missão 53 — provisionamento de usuário individual: cria a linha em `users` já com um token de
 * definição de primeira senha (nunca define senha diretamente — a pessoa sempre escolhe a própria
 * via `/definir-senha`, mesmo princípio de `src/lib/auth/password.ts`). Recebe `db` já pronto
 * (nunca chama `getDb()` internamente) de propósito: usada tanto de dentro do Next.js quanto de
 * `src/db/seed/provision-user.ts`, um script de linha de comando (`tsx`) que roda fora do runtime
 * do Next — por isso este módulo também não tem `import "server-only"` (mesma razão documentada
 * em `setup-token.ts`).
 *
 * Nunca modifica um usuário já existente (Parte F da Missão 53): se o e-mail já existe, retorna
 * `already_exists` com os dados públicos da linha atual, sem tocar em role/hash/token dela. Um
 * reenvio de link ou reset de senha é, deliberadamente, um fluxo separado e explícito — não
 * implementado aqui.
 */

export interface ProvisionUserInput {
  email: string;
  name: string;
  role: UserRole;
  /** Injetável só para teste determinístico da expiração — fora de teste, sempre `new Date()`. */
  now?: Date;
}

export type ProvisionUserResult =
  | { status: "created"; userId: string; email: string; name: string; role: UserRole; setupToken: string; setupTokenExpiresAt: Date }
  | { status: "already_exists"; userId: string; email: string; role: UserRole }
  | { status: "invalid_role"; role: string }
  | { status: "invalid_email" }
  | { status: "invalid_name" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mesma normalização já usada por `loginAction` (`src/app/login/actions.ts`) — precisa bater com o que o login compara. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "23505";
}

export async function provisionUser(db: Database, input: ProvisionUserInput): Promise<ProvisionUserResult> {
  if (!userRoles.includes(input.role)) {
    return { status: "invalid_role", role: input.role };
  }

  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email)) {
    return { status: "invalid_email" };
  }

  const name = input.name.trim();
  if (!name) {
    return { status: "invalid_name" };
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return { status: "already_exists", userId: existing.id, email: existing.email, role: existing.role };
    }

    const now = input.now ?? new Date();
    const setupToken = generateSetupToken();
    const setupTokenExpiresAt = new Date(now.getTime() + PASSWORD_SETUP_TOKEN_TTL_MS);

    try {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          name,
          role: input.role,
          active: true,
          passwordHash: null,
          passwordSetupToken: setupToken,
          passwordSetupTokenExpiresAt: setupTokenExpiresAt,
          mustChangePassword: false,
          source: "provisioning-script",
        })
        .returning({ id: users.id });

      return { status: "created", userId: created.id, email, name, role: input.role, setupToken, setupTokenExpiresAt };
    } catch (err) {
      // A checagem acima não elimina sozinha uma corrida real entre duas chamadas concorrentes
      // para o mesmo e-mail (mesma classe de limitação já documentada em
      // `createAppointmentAction`, `src/app/planejamento/actions.ts`) — quem garante que nunca
      // existem duas linhas com o mesmo e-mail é o índice único de `users.email` no banco
      // (`src/db/schema/auth.ts`). Se a corrida acontecer, a transação perdedora cai aqui: em vez
      // de propagar um erro cru de constraint, relê a linha vencedora e responde `already_exists`.
      if (isUniqueViolation(err)) {
        const [raceWinner] = await tx.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
        if (raceWinner) return { status: "already_exists", userId: raceWinner.id, email: raceWinner.email, role: raceWinner.role };
      }
      throw err;
    }
  });
}

/**
 * Missão 55 — "primeiro acesso" de um usuário JÁ existente que nunca definiu senha (ex.: uma linha
 * criada manualmente no banco, fora de `provisionUser`, como aconteceu com Vinicius). Deliberadamente
 * mais estreito que um reset administrativo genérico: só emite token para quem `passwordHash` ainda
 * é `null` — nunca serve para "resetar" a senha de alguém que já fez login (ex.: Robério), que
 * precisaria de um fluxo diferente e explícito, não implementado aqui.
 *
 * Nunca cria usuário, nunca toca `email`/`role`/`name`/`active`/`id` — só substitui
 * `passwordSetupToken`/`passwordSetupTokenExpiresAt` da MESMA linha (`where(eq(users.id, ...))`,
 * nunca por e-mail de novo, para nunca arriscar tocar outra linha). Se já havia um token pendente,
 * ele é substituído atomicamente na mesma escrita — o valor antigo para de bater em qualquer busca
 * (`/definir-senha` compara o token inteiro), então nunca ficam dois tokens simultaneamente válidos.
 */

export interface IssueFirstAccessInput {
  email: string;
  /** Injetável só para teste determinístico da expiração — fora de teste, sempre `new Date()`. */
  now?: Date;
}

export type IssueFirstAccessResult =
  | { status: "issued"; userId: string; email: string; role: UserRole; setupToken: string; setupTokenExpiresAt: Date; hadPendingToken: boolean }
  | { status: "not_found" }
  | { status: "inactive"; userId: string }
  | { status: "already_has_password"; userId: string };

export async function issueFirstAccessSetupToken(db: Database, input: IssueFirstAccessInput): Promise<IssueFirstAccessResult> {
  const email = normalizeEmail(input.email);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, role: users.role, active: users.active, passwordHash: users.passwordHash, passwordSetupToken: users.passwordSetupToken })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return { status: "not_found" };
    if (!user.active) return { status: "inactive", userId: user.id };
    if (user.passwordHash !== null) return { status: "already_has_password", userId: user.id };

    const hadPendingToken = user.passwordSetupToken !== null;
    const now = input.now ?? new Date();
    const setupToken = generateSetupToken();
    const setupTokenExpiresAt = new Date(now.getTime() + PASSWORD_SETUP_TOKEN_TTL_MS);

    const [updated] = await tx
      .update(users)
      .set({ passwordSetupToken: setupToken, passwordSetupTokenExpiresAt: setupTokenExpiresAt, updatedAt: now })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, email: users.email, role: users.role });

    return { status: "issued", userId: updated.id, email: updated.email, role: updated.role, setupToken, setupTokenExpiresAt, hadPendingToken };
  });
}
