import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

/**
 * Papéis de acesso — Missão de Usuários Individuais (V5.3). Substitui o conjunto especulativo
 * anterior (owner/manager/parking/detailing/finance/hr/read_only), nunca usado em produção
 * (tabela sempre teve 0 linhas), por exatamente o que o gestor pediu agora: ADMIN (acesso total)
 * e OPERACIONAL (acesso restrito às funções do dia a dia). Aditivo a partir daqui — novos papéis
 * (ex.: gerente, atendimento, financeiro, estoque) devem ser ACRESCENTADOS a este enum quando
 * forem realmente necessários, nunca antecipados sem uso real (mesma lição que motivou esta troca).
 */
export const userRoleEnum = pgEnum("user_role", ["admin", "operacional"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("operacional"),
  /**
   * Missão de Identidade Contextual do Zézinho — cargo/função empresarial (ex.: "Proprietário/
   * Administrador", "Gerente"), puramente informativo. Nunca usado por nenhuma decisão de RBAC
   * (isso continua sendo função exclusiva de `role`, acima) — só contexto de conversa, para o
   * Zézinho saber COM QUEM está falando sem precisar perguntar. Null até o gestor preencher.
   */
  businessTitle: text("business_title"),
  /**
   * Hash da senha (scrypt, ver src/lib/auth/password.ts), nunca a senha em texto puro.
   * Fica null enquanto o usuário ainda não definiu a própria senha (ver `passwordSetupToken`).
   */
  passwordHash: text("password_hash"),
  /**
   * Token de definição/redefinição de senha (aleatório, de uso único) — permite que o próprio
   * usuário escolha a senha direto no navegador, sem que ela precise ser digitada, vista ou
   * transmitida por mais ninguém (nem pelo gestor, nem pelo assistente que cria o usuário).
   * Null quando não há definição pendente. Limpo (volta a null) assim que a senha é definida.
   */
  passwordSetupToken: text("password_setup_token").unique(),
  passwordSetupTokenExpiresAt: timestamp("password_setup_token_expires_at", { withTimezone: true }),
  /** Força a troca de senha no próximo login (ex.: após reset administrativo). */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
