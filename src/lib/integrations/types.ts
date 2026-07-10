export type IntegrationMode = "leitura" | "leitura_escrita" | "nao_conectado";
export type IntegrationStatus = "nao_configurado" | "planejado" | "ativo";

export interface IntegrationMeta {
  id: string;
  name: string;
  description: string;
  source: string;
  status: IntegrationStatus;
  mode: IntegrationMode;
  futurePermissions: string[];
  risks: string[];
  dependencies: string[];
  envVars: string[];
}
