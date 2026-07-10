import type { IntegrationMeta } from "../types";

/**
 * Adaptador futuro para câmeras Intelbras/Mibo (módulo Vigia).
 * Nenhuma transmissão real, nenhuma abertura de porta RTSP na internet.
 */
export const camerasIntegration: IntegrationMeta = {
  id: "cameras",
  name: "Intelbras / Mibo Smart",
  description: "Monitoramento de câmeras via ponte local segura (RTSP/ONVIF futuro).",
  source: "Intelbras iM3 C Black — app Mibo Smart",
  status: "nao_configurado",
  mode: "nao_conectado",
  futurePermissions: ["Leitura de status online/offline", "Leitura de alertas de movimento (futuro)"],
  risks: [
    "Não expor porta RTSP (554) diretamente na internet.",
    "Não versionar usuário/senha das câmeras.",
    "Transmissão ao vivo depende de ponte local segura ou integração oficial.",
  ],
  dependencies: ["Ponte local (NVR ou serviço dedicado)", "Rede Vivo Fibra estável"],
  envVars: ["CAMERAS_BRIDGE_URL", "CAMERAS_BRIDGE_TOKEN"],
};

export function isCamerasConfigured(): boolean {
  return false;
}
