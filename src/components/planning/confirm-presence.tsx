"use client";

import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { updateAppointmentStatusAction } from "@/app/planejamento/actions";
import { cn } from "@/lib/utils/cn";
import type { AppointmentStatus } from "@/lib/planning/types";

/**
 * "Confirmar presença" — registra o resultado do contato com o cliente. Sem integração de
 * WhatsApp nesta missão (só a estrutura de status); o contato em si continua manual.
 */
export function ConfirmPresence({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle(status: AppointmentStatus) {
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(appointmentId, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground-muted active:scale-[0.98]"
      >
        <CalendarCheck className="h-3.5 w-3.5" />
        Confirmar presença
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-xs text-critical">{error}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <ConfirmButton label="Confirmado" onClick={() => handle("confirmado")} disabled={isPending} tone="positive" />
        <ConfirmButton label="Não confirmado" onClick={() => handle("agendado")} disabled={isPending} tone="default" />
        <ConfirmButton label="Reagendar" onClick={() => handle("reagendado")} disabled={isPending} tone="default" />
        <ConfirmButton label="Cancelado" onClick={() => handle("cancelado")} disabled={isPending} tone="critical" />
      </div>
    </div>
  );
}

function ConfirmButton({ label, onClick, disabled, tone }: { label: string; onClick: () => void; disabled: boolean; tone: "positive" | "critical" | "default" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98] disabled:opacity-50",
        tone === "positive" && "border-positive/40 bg-positive-bg text-positive",
        tone === "critical" && "border-critical/40 bg-critical-bg text-critical",
        tone === "default" && "border-border bg-background-elevated text-foreground-muted",
      )}
    >
      {label}
    </button>
  );
}
