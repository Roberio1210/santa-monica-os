"use client";

import { useState, useTransition } from "react";
import { updateAppointmentStatusAction } from "@/app/planejamento/actions";
import { cn } from "@/lib/utils/cn";
import type { AppointmentStatus } from "@/lib/planning/types";

/**
 * Missão 40 (item 10) — expõe SOMENTE as transições que fazem sentido operacionalmente a partir
 * do status atual (nunca "Concluir" num agendamento que ainda não começou, nunca nada num
 * agendamento já concluído/cancelado/reagendado). Reaproveita `updateAppointmentStatusAction`
 * exatamente como já existe — nenhuma regra de transição nova, só a exposição na UI é nova.
 */
export function DayAppointmentActions({ appointmentId, status }: { appointmentId: string; status: AppointmentStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle(next: AppointmentStatus) {
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(appointmentId, next);
      setError(result.error);
    });
  }

  const actions: { label: string; next: AppointmentStatus; tone: "positive" | "critical" }[] = [];
  if (status === "agendado" || status === "confirmado") {
    actions.push({ label: "Iniciar atendimento", next: "em_andamento", tone: "positive" });
    actions.push({ label: "Cancelar", next: "cancelado", tone: "critical" });
  } else if (status === "em_andamento") {
    actions.push({ label: "Concluir", next: "concluido", tone: "positive" });
    actions.push({ label: "Cancelar", next: "cancelado", tone: "critical" });
  }

  if (actions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {error ? <p className="text-xs text-critical">{error}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <button
            key={action.next}
            type="button"
            onClick={() => handle(action.next)}
            disabled={isPending}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98] disabled:opacity-50",
              action.tone === "positive" && "border-positive/40 bg-positive-bg text-positive",
              action.tone === "critical" && "border-critical/40 bg-critical-bg text-critical",
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
