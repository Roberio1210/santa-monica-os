import type { IntegrationMeta } from "../types";

/**
 * Adaptador futuro para Meta Ads / Instagram / Facebook.
 * Nenhuma chamada real é realizada nesta fase.
 */
export const metaIntegration: IntegrationMeta = {
  id: "meta",
  name: "Meta Ads / Instagram / Facebook",
  description: "Campanhas, alcance, leads e desempenho de anúncios no ecossistema Meta.",
  source: "Meta Marketing API",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura de campanhas", "Leitura de métricas de anúncios", "Leitura de leads"],
  risks: ["Nenhuma alteração de orçamento ou publicação automática é permitida sem aprovação humana."],
  dependencies: ["Conta de anúncios Meta Business", "Token de acesso de longa duração"],
  envVars: ["META_APP_ID", "META_APP_SECRET", "META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
};

export function isMetaConfigured(): boolean {
  return false;
}
