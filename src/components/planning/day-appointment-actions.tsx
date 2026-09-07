"use client";

import { useState, useTransition } from "react";
import { updateAppointmentStatusAction } from "@/app/planejamento/actions";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { isDatePast } from "@/lib/planning/dayView";
import { cn } from "@/lib/utils/cn";
import { formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";
import type { AppointmentStatus } from "@/lib/planning/types";

/**
 * Missão 40 (item 10) / Missão 46 (Partes B-H) — expõe SOMENTE as transições que fazem sentido
 * operacionalmente a partir do status atual E da data do agendamento em relação a hoje (América/
 * São Paulo, mesma fonte usada pelo backend em `updateAppointmentStatus`). Nenhuma regra de
 * transição nova: a proteção real (autoritativa) já vive em `service.ts` — isto aqui só evita
 * oferecer um botão que o backend recusaria, e adiciona confirmação explícita antes de cancelar.
 *
 * Datas passadas: nenhuma ação, card vira histórico ("Histórico" no lugar dos botões).
 * Datas futuras: nunca "Iniciar atendimento"/"Concluir" (só fazem sentido no próprio dia).
 */
export function DayAppointmentActions({
  appointmentId,
  status,
  scheduledAt,
  todayIso,
  customerName,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  scheduledAt: string;
  todayIso: string;
  customerName: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const appointmentDateIso = saoPauloDateISO(new Date(scheduledAt));
  const isPast = isDatePast(appointmentDateIso, todayIso);
  const isToday = appointmentDateIso === todayIso;

  function handle(next: AppointmentStatus) {
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(appointmentId, next);
      setError(result.error);
      if (!result.error) setConfirmOpen(false);
    });
  }

  if (isPast) {
    return <span className="text-xs font-medium text-foreground-subtle">Histórico</span>;
  }

  const canStart = (status === "agendado" || status === "confirmado") && isToday;
  const canComplete = status === "em_andamento" && isToday;
  const canCancel = status === "agendado" || status === "confirmado" || status === "em_andamento";

  if (!canStart && !canComplete && !canCancel) return null;

  return (
    <div className="space-y-1.5">
      {error ? <p className="text-xs text-critical">{error}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {canStart ? <ActionButton label="Iniciar atendimento" tone="positive" disabled={isPending} onClick={() => handle("em_andamento")} /> : null}
        {canComplete ? <ActionButton label="Concluir" tone="positive" disabled={isPending} onClick={() => handle("concluido")} /> : null}
        {canCancel ? (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger
              disabled={isPending}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98] disabled:opacity-50",
                "border-critical/40 bg-critical-bg text-critical",
              )}
            >
              Cancelar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancelar agendamento?</DialogTitle>
                <DialogDescription>
                  Esta ação cancelará o agendamento de {customerName ?? "Cliente sem nome cadastrado"} em {formatDateBR(appointmentDateIso)} às {saoPauloTimeHM(new Date(scheduledAt))}.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground-muted" disabled={isPending}>
                    Voltar
                  </button>
                </DialogClose>
                <button
                  type="button"
                  onClick={() => handle("cancelado")}
                  disabled={isPending}
                  className="h-9 rounded-lg border border-critical/40 bg-critical-bg px-3 text-xs font-medium text-critical disabled:opacity-50"
                >
                  {isPending ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              </DialogBody>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({ label, tone, disabled, onClick }: { label: string; tone: "positive" | "critical"; disabled: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98] disabled:opacity-50",
        tone === "positive" && "border-positive/40 bg-positive-bg text-positive",
        tone === "critical" && "border-critical/40 bg-critical-bg text-critical",
      )}
    >
      {label}
    </button>
  );
}
