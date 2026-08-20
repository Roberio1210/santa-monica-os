/**
 * Papéis de acesso — Missão de Usuários Individuais (V5.3). Espelha exatamente o enum
 * `user_role` em src/db/schema/auth.ts. ADMIN tem acesso total; OPERACIONAL tem acesso restrito
 * às funções do dia a dia (ver src/lib/auth/permissions.ts para as regras de rota/ação).
 */
export type UserRole = "admin" | "operacional";

export const userRoles: UserRole[] = ["admin", "operacional"];

export const userRoleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  operacional: "Operacional",
};
