/**
 * Papéis previstos para a autenticação completa (dependente de banco — ver
 * docs/database-and-auth-setup-guide.md). Espelha exatamente o enum `user_role` em
 * src/db/schema/auth.ts. Nenhum usuário real usa isto ainda.
 */
export type UserRole = "owner" | "manager" | "parking" | "detailing" | "finance" | "hr" | "read_only";

export const userRoles: UserRole[] = ["owner", "manager", "parking", "detailing", "finance", "hr", "read_only"];

export const userRoleLabels: Record<UserRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  parking: "Estacionamento",
  detailing: "Estética/Lavação",
  finance: "Financeiro",
  hr: "RH",
  read_only: "Somente leitura",
};
