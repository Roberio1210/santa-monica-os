import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { NOTIFICATION_PRIORITY_LABELS, type Notification } from "@/lib/manager-assistant/types";

const PRIORITY_BADGE: Record<Notification["priority"], BadgeProps["variant"]> = { critico: "critical", atencao: "warning", informativo: "info" };
const STATUS_LABEL: Record<Notification["status"], string> = { nova: "Nova", vista: "Vista", resolvida: "Resolvida" };
const RECIPIENT_LABEL: Record<Notification["recipient"], string> = { proprietario: "Proprietário", gerente: "Gerente", ambos: "Ambos" };

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Seção 6 — histórico interno de notificações, mais recente primeiro. */
export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) {
    return <p className="py-3 text-sm text-foreground-subtle">Nenhuma notificação registrada ainda.</p>;
  }

  return (
    <div className="space-y-2">
      {notifications.map((notification) => (
        <div key={notification.id} className="rounded-xl border border-border-subtle bg-background-panel p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{notification.title}</p>
            <Badge variant={PRIORITY_BADGE[notification.priority]}>{NOTIFICATION_PRIORITY_LABELS[notification.priority]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-foreground-muted">{notification.description}</p>
          <p className="mt-1.5 text-xs text-foreground-subtle">
            {formatDateTime(notification.occurredAt)} · {RECIPIENT_LABEL[notification.recipient]} · {STATUS_LABEL[notification.status]}
          </p>
        </div>
      ))}
    </div>
  );
}
