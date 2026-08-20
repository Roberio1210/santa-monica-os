import { describe, expect, it } from "vitest";
import { isPathAllowedForRole, canPerformInventoryAdminAction, canRegisterInventoryMovement, ROLE_HOME_PATH, OPERATIONAL_ALLOWED_PREFIXES } from "@/lib/auth/permissions";

const FINANCIAL_ROUTES = [
  "/financeiro",
  "/financeiro/fluxo-de-caixa",
  "/financeiro/contas-a-pagar",
  "/financeiro/contas-a-receber",
  "/financeiro/dre",
  "/financeiro/conta-stone",
  "/financeiro/stone-conciliacao",
  "/financeiro/despesas",
  "/financeiro/fornecedores",
  "/financeiro/classificacao",
  "/financeiro/fechamento",
  "/dashboard",
  "/painel-gerencial",
  "/configuracoes",
  "/seguranca",
  "/estoque",
  "/estoque/entradas",
  "/estoque/contagem",
  "/estoque/auditoria",
  "/estoque/receitas",
  "/estoque/compras",
];

const OPERATIONAL_ROUTES = [
  "/atendimento",
  "/operacao",
  "/ordens",
  "/ordens/servicos",
  "/lavacao",
  "/estacionamento",
  "/agenda",
  "/estoque/produtos",
  "/estoque/produtos/abc-123",
  "/estoque/saidas",
  "/estoque/consumos",
  "/estoque/pendencias",
  "/estoque/compras-sugeridas",
];

describe("isPathAllowedForRole — ADMIN", () => {
  it("acessa absolutamente tudo, incluindo rotas financeiras", () => {
    for (const route of [...FINANCIAL_ROUTES, ...OPERATIONAL_ROUTES]) {
      expect(isPathAllowedForRole("admin", route)).toBe(true);
    }
  });
});

describe("isPathAllowedForRole — OPERACIONAL", () => {
  it("é BLOQUEADO em todas as rotas financeiras/administrativas listadas na missão", () => {
    for (const route of FINANCIAL_ROUTES) {
      expect(isPathAllowedForRole("operacional", route)).toBe(false);
    }
  });

  it("acessa as rotas operacionais liberadas", () => {
    for (const route of OPERATIONAL_ROUTES) {
      expect(isPathAllowedForRole("operacional", route)).toBe(true);
    }
  });

  it("não confunde prefixo parcial (ex.: /estoque/produtosxyz não deve colar em /estoque/produtos)", () => {
    expect(isPathAllowedForRole("operacional", "/estoque/produtosxyz")).toBe(false);
  });

  it("bloqueia por padrão qualquer rota nova/desconhecida (default-deny)", () => {
    expect(isPathAllowedForRole("operacional", "/uma-rota-que-nao-existe-ainda")).toBe(false);
  });

  it("nenhum prefixo liberado para operacional aponta para área financeira", () => {
    for (const prefix of OPERATIONAL_ALLOWED_PREFIXES) {
      expect(prefix.startsWith("/financeiro")).toBe(false);
      expect(prefix).not.toBe("/dashboard");
      expect(prefix).not.toBe("/painel-gerencial");
      expect(prefix).not.toBe("/configuracoes");
    }
  });
});

describe("ROLE_HOME_PATH", () => {
  it("admin cai no dashboard, operacional cai em atendimento (nunca em rota financeira)", () => {
    expect(ROLE_HOME_PATH.admin).toBe("/dashboard");
    expect(ROLE_HOME_PATH.operacional).toBe("/atendimento");
    expect(isPathAllowedForRole("operacional", ROLE_HOME_PATH.operacional)).toBe(true);
  });
});

describe("Ações de estoque — admin vs operacional", () => {
  it("ações administrativas (custo/classificação/exclusão) são exclusivas de admin", () => {
    expect(canPerformInventoryAdminAction("admin", "update_cost")).toBe(true);
    expect(canPerformInventoryAdminAction("operacional", "update_cost")).toBe(false);
    expect(canPerformInventoryAdminAction("operacional", "change_classification")).toBe(false);
    expect(canPerformInventoryAdminAction("operacional", "delete_or_deactivate_item")).toBe(false);
    expect(canPerformInventoryAdminAction("operacional", "edit_item_metadata")).toBe(false);
  });

  it("registrar consumo/perda é permitido para os dois papéis", () => {
    expect(canRegisterInventoryMovement("admin", "register_consumption")).toBe(true);
    expect(canRegisterInventoryMovement("operacional", "register_consumption")).toBe(true);
    expect(canRegisterInventoryMovement("admin", "register_loss")).toBe(true);
    expect(canRegisterInventoryMovement("operacional", "register_loss")).toBe(true);
  });
});
