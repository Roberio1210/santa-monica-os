import type { IntegrationMeta } from "../types";

/**
 * Adaptador futuro para conciliação financeira Stone.
 * Nenhuma chamada real é realizada nesta fase.
 */
export const stoneIntegration: IntegrationMeta = {
  id: "stone",
  name: "Stone",
  description: "Conciliação de recebimentos e formas de pagamento.",
  source: "Stone API",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura de transações", "Leitura de recebíveis"],
  risks: ["Nenhuma movimentação financeira será executada automaticamente."],
  dependencies: ["Credencial de integração Stone"],
  envVars: ["STONE_API_KEY", "STONE_ACCOUNT_ID"],
};

export function isStoneConfigured(): boolean {
  return false;
}
