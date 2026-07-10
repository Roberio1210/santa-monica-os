import type { IntegrationMeta } from "../types";

/**
 * Adaptador futuro para pesquisa de preços no Mercado Livre.
 * Nenhuma chamada real, nenhuma compra e nenhum scraping agressivo.
 */
export const mercadoLivreIntegration: IntegrationMeta = {
  id: "mercadolivre",
  name: "Mercado Livre",
  description: "Pesquisa de preço, comparação de vendedores e oportunidades de compra.",
  source: "Mercado Livre API oficial",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura de preços públicos", "Leitura de reputação de vendedores"],
  risks: ["Nenhuma compra será realizada automaticamente.", "Uso restrito à API oficial, sem scraping agressivo."],
  dependencies: ["App registrado no Mercado Livre Developers"],
  envVars: ["MERCADOLIVRE_CLIENT_ID", "MERCADOLIVRE_CLIENT_SECRET"],
};

export function isMercadoLivreConfigured(): boolean {
  return false;
}
