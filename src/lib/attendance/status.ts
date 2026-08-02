import { SERVICE_ORDER_STATUSES, type ServiceOrderStatus } from "@/lib/attendance/types";

/**
 * Sequência operacional da Ordem de Serviço. `nextStatus` sugere o próximo passo (usado pelo
 * botão de avanço rápido no Painel do Gerente) — mas o gerente sempre pode escolher qualquer
 * status manualmente, para corrigir um engano sem travar o fluxo.
 */
export function nextStatus(current: ServiceOrderStatus): ServiceOrderStatus | null {
  const index = SERVICE_ORDER_STATUSES.indexOf(current);
  if (index === -1 || index === SERVICE_ORDER_STATUSES.length - 1) return null;
  return SERVICE_ORDER_STATUSES[index + 1];
}

export function isFinalStatus(status: ServiceOrderStatus): boolean {
  return status === "entregue";
}
