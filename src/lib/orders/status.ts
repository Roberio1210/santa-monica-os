import type { ConsumptionPreview } from "@/lib/orders/preview";
import type { ConsumptionConfirmationStatus } from "@/lib/orders/types";

export type OrderConsumptionStatus = "bloqueado" | "previa_disponivel" | "aguardando_confirmacao" | "confirmado" | "parcialmente_confirmado" | "estornado";

export const orderConsumptionStatusLabels: Record<OrderConsumptionStatus, string> = {
  bloqueado: "Bloqueado",
  previa_disponivel: "Prévia disponível",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Confirmado",
  parcialmente_confirmado: "Parcialmente confirmado",
  estornado: "Estornado",
};

/**
 * Deriva o status de exibição da ordem (Fase D, seção 3) a partir da prévia (pura, D2) e da
 * última confirmação conhecida — nunca um novo cálculo, só combina o que já existe.
 */
export function classifyOrderStatus(preview: ConsumptionPreview, latestConfirmationStatus: ConsumptionConfirmationStatus | null): OrderConsumptionStatus {
  if (latestConfirmationStatus === "confirmada") return "confirmado";
  if (latestConfirmationStatus === "parcial") return "parcialmente_confirmado";
  if (latestConfirmationStatus === "estornada") return "estornado";
  if (preview.state === "bloqueada") return "bloqueado";
  if (preview.state === "parcial") return "previa_disponivel";
  return "aguardando_confirmacao";
}
