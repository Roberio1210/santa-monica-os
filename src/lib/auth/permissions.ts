import type { UserRole } from "@/lib/auth/roles";

/**
 * Missão de Usuários Individuais (V5.3) — regra central de autorização, usada tanto pelo
 * middleware (rota) quanto pelas Server Actions sensíveis (ação). Nunca `if (user.name === "Vinicius")`
 * em nenhum lugar do código — tudo depende só de `role`.
 *
 * Modelo: ADMIN vê e faz tudo. OPERACIONAL só acessa o que está explicitamente permitido aqui —
 * default-deny (uma rota nova, criada no futuro e não listada, fica bloqueada para operacional
 * até alguém decidir liberá-la, nunca o contrário).
 */

/**
 * Prefixos de rota liberados para o papel `operacional`. Correspondência por prefixo de path
 * (ex.: "/estoque/produtos" libera também "/estoque/produtos/abc123"). Rotas de autenticação
 * (login/definir-senha/logout) sempre precisam ficar acessíveis sem sessão — tratadas à parte no
 * middleware, não fazem parte desta lista.
 */
export const OPERATIONAL_ALLOWED_PREFIXES: string[] = [
  "/atendimento",
  "/operacao",
  "/ordens",
  "/lavacao",
  "/estacionamento",
  "/agenda",
  "/estoque/produtos",
  "/estoque/saidas",
  "/estoque/consumos",
  "/estoque/pendencias",
  "/estoque/compras-sugeridas",
];

/** Página inicial de cada papel após o login — ADMIN mantém o dashboard atual, OPERACIONAL cai direto na Gestão do Dia. */
export const ROLE_HOME_PATH: Record<UserRole, string> = {
  admin: "/dashboard",
  operacional: "/atendimento",
};

export function isPathAllowedForRole(role: UserRole, pathname: string): boolean {
  if (role === "admin") return true;
  return OPERATIONAL_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`));
}

/**
 * Ações específicas de estoque que só ADMIN pode executar, mesmo dentro de uma rota que
 * OPERACIONAL já pode acessar (ex.: `/estoque/produtos/[id]` é de leitura para operacional, mas
 * `updateItemDetailsAction`/`toggleItemActiveAction` continuam exclusivas de admin).
 */
export type InventoryAdminAction = "update_cost" | "change_classification" | "delete_or_deactivate_item" | "edit_item_metadata";

const OPERATIONAL_ALLOWED_INVENTORY_ACTIONS = new Set(["register_consumption", "register_loss"]);

export function canPerformInventoryAdminAction(role: UserRole, action: InventoryAdminAction): boolean {
  // Hoje todas as ações administrativas de estoque seguem a mesma regra (só admin) — o parâmetro
  // `action` existe para o call-site ficar explícito sobre QUAL ação está sendo checada, e para
  // que, se uma ação futura precisar de regra própria, o ponto de extensão já exista aqui.
  void action;
  return role === "admin";
}

export function canRegisterInventoryMovement(role: UserRole, action: "register_consumption" | "register_loss"): boolean {
  if (role === "admin") return true;
  return OPERATIONAL_ALLOWED_INVENTORY_ACTIONS.has(action);
}
