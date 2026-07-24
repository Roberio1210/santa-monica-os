import type { IntegrationMeta } from "../types";

/**
 * Metadado de exibição da integração Stone (Sprint 7.0). O adaptador real vive em
 * `service.ts`/`client.ts`/`xml.ts` (Z1: arquitetura + provider + tipagens completos, ainda sem
 * nenhum Diretor/tool consumindo) — ver docs/stone-integration-architecture.md.
 */
export const stoneIntegration: IntegrationMeta = {
  id: "stone",
  name: "Stone",
  description: "Conciliação financeira: vendas, recebimentos, antecipações, cancelamentos, chargebacks e PIX.",
  source: "Conciliação Cliente Stone — https://conciliacao.stone.com.br/reference/overview-da-api-cliente-stone",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura do arquivo diário de conciliação (vendas, recebimentos, cancelamentos, chargebacks)", "Leitura de posição de carteira (Layout 2.4)", "Leitura de arquivo PIX (fluxo assíncrono via webhook)"],
  risks: ["Nenhuma movimentação financeira será executada automaticamente.", "Somente leitura — nenhum endpoint de escrita é usado."],
  dependencies: ["Credencial de integração Stone (API key do Portal Stone)"],
  envVars: ["STONE_API_KEY", "STONE_ACCOUNT_ID"],
};
