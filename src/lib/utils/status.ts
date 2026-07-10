import type { ServiceStatus } from "@/types/service";
import type { BadgeProps } from "@/components/ui/badge";

const labels: Record<ServiceStatus, string> = {
  agendado: "Agendado",
  recebido: "Recebido",
  em_execucao: "Em execução",
  revisao: "Revisão",
  pronto: "Pronto",
  entregue: "Entregue",
};

const variants: Record<ServiceStatus, NonNullable<BadgeProps["variant"]>> = {
  agendado: "outline",
  recebido: "info",
  em_execucao: "warning",
  revisao: "warning",
  pronto: "positive",
  entregue: "default",
};

export function statusLabel(status: ServiceStatus): string {
  return labels[status];
}

export function statusVariant(status: ServiceStatus): NonNullable<BadgeProps["variant"]> {
  return variants[status];
}
