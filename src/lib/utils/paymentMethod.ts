import type { PaymentMethod } from "@/types/common";

/**
 * Camada neutra (como `mask.ts`) — pode ser importada tanto por `integrations/jumppark` quanto
 * por `domain/operational` sem violar a regra de que o domínio não deve acoplar-se à camada de
 * integração além do que já é público em `types.ts`. Antes desta extração, a mesma lógica existia
 * triplicada (duas cópias em `integrations/jumppark`, uma mirrorada em `domain/operational`).
 */
export function classifyPaymentMethod(name: string): PaymentMethod {
  const normalized = name.toLowerCase();
  if (normalized.includes("dinheiro") || normalized.includes("cash")) return "dinheiro";
  if (normalized.includes("debito") || normalized.includes("débito")) return "debito";
  if (normalized.includes("credito") || normalized.includes("crédito")) return "credito";
  if (normalized.includes("pix")) return "pix";
  return "outro";
}
