import { Badge, type BadgeProps } from "@/components/ui/badge";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/lib/planning/types";

const STATUS_VARIANT: Record<AppointmentStatus, NonNullable<BadgeProps["variant"]>> = {
  agendado: "outline",
  confirmado: "info",
  em_andamento: "warning",
  concluido: "positive",
  cancelado: "critical",
  reagendado: "default",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>;
}
