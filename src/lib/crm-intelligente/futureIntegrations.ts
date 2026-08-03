import type { FutureIntegrationsScaffold } from "@/lib/crm-intelligente/types";

/**
 * "INTEGRAÇÕES FUTURAS" (Missão 21) — "Preparar estrutura para Agenda; Financeiro; Marketing;
 * WhatsApp; Estoque. SEM implementar. Apenas deixar preparada." Constante estática e deliberada:
 * não é um dado do banco, é só o scaffold pedido — a UI mostra isso claramente como "em breve",
 * nunca como se fosse informação real.
 */
export const FUTURE_INTEGRATIONS_SCAFFOLD: FutureIntegrationsScaffold = {
  agenda: { status: "nao_implementado", label: "Agenda" },
  financeiro: { status: "nao_implementado", label: "Financeiro" },
  marketing: { status: "nao_implementado", label: "Marketing" },
  whatsapp: { status: "nao_implementado", label: "WhatsApp" },
  estoque: { status: "nao_implementado", label: "Estoque" },
};
