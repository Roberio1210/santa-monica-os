"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { advanceServiceOrderStatusAction, setServiceOrderStatusAction } from "@/app/atendimento/actions";
import { SERVICE_ORDER_STATUSES, SERVICE_ORDER_STATUS_LABELS, type ServiceOrderStatus } from "@/lib/attendance/types";
import { nextStatus } from "@/lib/attendance/status";

/** Avançar (ação rápida) + correção manual — o gerente nunca fica travado num status errado. */
export function OrderStatusActions({ serviceOrderId, status }: { serviceOrderId: string; status: ServiceOrderStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next = nextStatus(status);

  function handleAdvance() {
    startTransition(async () => {
      await advanceServiceOrderStatusAction(serviceOrderId, status);
      router.refresh();
    });
  }

  function handleManualChange(newStatus: ServiceOrderStatus) {
    startTransition(async () => {
      await setServiceOrderStatusAction(serviceOrderId, newStatus);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {next ? (
        <Button type="button" size="sm" variant="outline" onClick={handleAdvance} disabled={isPending}>
          <ArrowRight className="h-3.5 w-3.5" />
          {SERVICE_ORDER_STATUS_LABELS[next]}
        </Button>
      ) : null}
      <select
        value={status}
        onChange={(e) => handleManualChange(e.target.value as ServiceOrderStatus)}
        disabled={isPending}
        aria-label="Corrigir status manualmente"
        className="h-8 rounded-md border border-border bg-background-elevated px-1.5 text-xs text-foreground-muted"
      >
        {SERVICE_ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SERVICE_ORDER_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
