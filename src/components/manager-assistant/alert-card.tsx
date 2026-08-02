"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, AlertCircle, Info, Eye } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { markNotificationSeenAction } from "@/app/assistente-gerente/actions";
import type { ManagerAlertView } from "@/lib/manager-assistant/service";

const LEVEL_BADGE: Record<ManagerAlertView["level"], BadgeProps["variant"]> = { critico: "critical", atencao: "warning", informativo: "info" };
const LEVEL_ICON = { critico: AlertTriangle, atencao: AlertCircle, informativo: Info } as const;
const LEVEL_LABEL: Record<ManagerAlertView["level"], string> = { critico: "Crítico", atencao: "Atenção", informativo: "Informativo" };

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Card de alerta — nunca depende só da cor (ícone + rótulo textual do nível sempre presentes). */
export function AlertCard({ alert }: { alert: ManagerAlertView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const Icon = LEVEL_ICON[alert.level];
  const alreadySeen = alert.status === "vista" || alert.status === "resolvida";

  function handleMarkSeen() {
    if (!alert.notificationId) return;
    startTransition(async () => {
      await markNotificationSeenAction(alert.notificationId as string);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-background-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
          <div>
            <p className="text-sm font-semibold text-foreground">{alert.title}</p>
            <p className="mt-0.5 text-sm text-foreground-muted">{alert.description}</p>
          </div>
        </div>
        <Badge variant={LEVEL_BADGE[alert.level]}>{LEVEL_LABEL[alert.level]}</Badge>
      </div>

      <p className="mt-2 text-xs text-foreground-subtle">
        {formatClockTime(alert.occurredAt)} · {alert.customerName ?? "Cliente"} · {alert.vehicleModel ?? "Veículo"}
        {alert.vehiclePlate ? ` · ${alert.vehiclePlate}` : ""}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/atendimento/ordens/${alert.serviceOrderId}`}>Abrir ordem</Link>
        </Button>
        {alert.notificationId && !alreadySeen ? (
          <Button size="sm" variant="ghost" onClick={handleMarkSeen} disabled={isPending}>
            <Eye className="h-3.5 w-3.5" />
            {isPending ? "Marcando..." : "Marcar como visto"}
          </Button>
        ) : alreadySeen ? (
          <span className="text-xs text-foreground-subtle">Visto</span>
        ) : null}
      </div>
    </div>
  );
}
