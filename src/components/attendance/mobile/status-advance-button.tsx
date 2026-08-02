"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { advanceServiceOrderStatusAction } from "@/app/atendimento/actions";
import { SERVICE_ORDER_STATUS_LABELS, type ServiceOrderStatus } from "@/lib/attendance/types";
import { nextStatus } from "@/lib/attendance/status";

/** Avanço de status em um toque só, sem tela intermediária — atualiza a página no lugar via `router.refresh()`. */
export function StatusAdvanceButton({ serviceOrderId, currentStatus }: { serviceOrderId: string; currentStatus: ServiceOrderStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next = nextStatus(currentStatus);

  if (!next) {
    return (
      <div className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-positive/40 bg-positive-bg text-base font-medium text-positive">
        <CheckCircle2 className="h-5 w-5" />
        Entregue
      </div>
    );
  }

  function handleAdvance() {
    startTransition(async () => {
      await advanceServiceOrderStatusAction(serviceOrderId, currentStatus);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleAdvance}
      disabled={isPending}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
    >
      {isPending ? "Atualizando..." : `Avançar para ${SERVICE_ORDER_STATUS_LABELS[next]}`}
      {!isPending ? <ChevronRight className="h-5 w-5" /> : null}
    </button>
  );
}
