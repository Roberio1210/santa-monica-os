import type { IntegrationMeta } from "../types";

/**
 * Adaptador futuro para Google Business Profile / Calendar / Sheets.
 * Nenhuma chamada real é realizada nesta fase.
 */
export const googleIntegration: IntegrationMeta = {
  id: "google",
  name: "Google Business Profile / Calendar / Sheets",
  description: "Avaliações, Maps, agenda e planilhas de apoio.",
  source: "Google Business Profile API / Calendar API / Sheets API",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura de avaliações", "Leitura/escrita de agenda (futura, com aprovação)"],
  risks: ["Escrita em agenda real só será habilitada após confirmação explícita do proprietário."],
  dependencies: ["Conta Google Business verificada", "OAuth 2.0"],
  envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
};

export function isGoogleConfigured(): boolean {
  return false;
}
