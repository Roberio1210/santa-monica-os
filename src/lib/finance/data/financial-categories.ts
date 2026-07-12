import type { FinancialCategory } from "@/lib/finance/types";

/**
 * Espelha o plano de contas real do banco (src/db/seed/chart-of-accounts.ts) — usado só como
 * fallback em memória para os formulários de Contas a Pagar funcionarem sem banco. IDs aqui são
 * os mesmos slugs (`external_id`) usados no seed, para consistência de exibição.
 */
export const initialFinancialCategories: FinancialCategory[] = [
  { id: "receita-estacionamento", name: "Estacionamento", type: "receita" },
  { id: "receita-lavacao", name: "Lavação", type: "receita" },
  { id: "receita-servicos-adicionais", name: "Serviços adicionais", type: "receita" },
  { id: "receita-polimento", name: "Polimento", type: "receita" },
  { id: "receita-vitrificacao", name: "Vitrificação", type: "receita" },
  { id: "receita-higienizacao", name: "Higienização", type: "receita" },
  { id: "receita-farois", name: "Faróis", type: "receita" },
  { id: "receita-contratos-mensais", name: "Contratos mensais", type: "receita" },
  { id: "receita-parcerias-pos-pagas", name: "Parcerias pós-pagas", type: "receita" },
  { id: "receita-outros-servicos", name: "Outros serviços", type: "receita" },
  { id: "despesa-produtos-e-insumos", name: "Produtos e insumos", type: "despesa" },
  { id: "despesa-equipamentos", name: "Equipamentos", type: "despesa" },
  { id: "despesa-manutencao", name: "Manutenção", type: "despesa" },
  { id: "despesa-aluguel", name: "Aluguel", type: "despesa" },
  { id: "despesa-energia", name: "Energia", type: "despesa" },
  { id: "despesa-agua", name: "Água", type: "despesa" },
  { id: "despesa-internet", name: "Internet", type: "despesa" },
  { id: "despesa-marketing", name: "Marketing", type: "despesa" },
  { id: "despesa-salarios-clt", name: "Salários CLT", type: "despesa" },
  { id: "despesa-prestadores-pj", name: "Prestadores PJ", type: "despesa" },
  { id: "despesa-tributos", name: "Tributos", type: "despesa" },
  { id: "despesa-contabilidade", name: "Contabilidade", type: "despesa" },
  { id: "despesa-sistemas-e-assinaturas", name: "Sistemas e assinaturas", type: "despesa" },
  { id: "despesa-transporte-e-logistica", name: "Transporte e logística", type: "despesa" },
  { id: "despesa-outras-despesas", name: "Outras despesas", type: "despesa" },
  { id: "despesa-telefonia", name: "Telefonia", type: "despesa" },
  { id: "despesa-emprestimos-e-financiamentos", name: "Empréstimos e financiamentos", type: "despesa" },
  { id: "despesa-reembolso-a-socios-colaboradores", name: "Reembolso a sócios/colaboradores", type: "despesa" },
  { id: "despesa-retirada-de-lucro-distribuicao-a-socios", name: "Retirada de lucro/distribuição a sócios", type: "despesa" },
];
