import type { Config } from "drizzle-kit";

/**
 * Configuração usada apenas pela CLI drizzle-kit (geração/aplicação de migrations), nunca pelo
 * runtime da aplicação. `dbCredentials.url` só é lido quando um comando drizzle-kit que precisa
 * de conexão real é executado (ex.: `migrate`) — `generate` funciona sem DATABASE_URL, a partir
 * do schema TypeScript. Ver docs/database-and-auth-setup-guide.md.
 */
export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
  strict: true,
  verbose: true,
} satisfies Config;
