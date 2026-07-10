import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

/**
 * Papéis de acesso previstos (seção 7 da execução de fundação técnica). Nenhum usuário real é
 * criado por esta migração — a tabela fica pronta para o primeiro `owner` ser criado manualmente
 * pelo proprietário (ver docs/database-and-auth-setup-guide.md).
 */
export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "manager",
  "parking",
  "detailing",
  "finance",
  "hr",
  "read_only",
]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("read_only"),
  /**
   * Hash da senha (ex.: bcrypt/argon2), nunca a senha em texto puro. Null enquanto a
   * autenticação completa não está habilitada — o gate temporário (APP_ACCESS_*) não usa
   * esta tabela.
   */
  passwordHash: text("password_hash"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
