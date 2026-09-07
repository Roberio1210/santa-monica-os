import { Phone } from "lucide-react";
import { ClientSignalBadges } from "@/components/planning/client-signals";
import { DayAppointmentActions } from "@/components/planning/day-appointment-actions";
import { StatusBadge } from "@/components/planning/status-badge";
import { formatDurationMinutes } from "@/lib/utils/format";
import { saoPauloTimeHM } from "@/lib/utils/timezone";
import type { DayAppointmentView } from "@/lib/planning/types";

/** Missão 40 (item 6) — cartão do agendamento na timeline do dia: horário inicial–final, cliente, veículo, placa, serviço, duração, status. */
export function DayAppointmentCard({ appointment, capacityBoxesCount }: { appointment: DayAppointmentView; capacityBoxesCount: number | null }) {
  const start = saoPauloTimeHM(new Date(appointment.scheduledAt));
  const end = appointment.endAt ? saoPauloTimeHM(new Date(appointment.endAt)) : null;
  const showOccupancyBadge = appointment.simultaneousCount !== null && capacityBoxesCount !== null;

  return (
    <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-foreground">{end ? `${start} – ${end}` : start}</p>
          {!end ? <p className="text-xs text-warning">Horário final não definido</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showOccupancyBadge ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                (appointment.simultaneousCount as number) > 1 ? "border-warning/40 bg-warning-bg text-warning" : "border-border-subtle text-foreground-subtle"
              }`}
            >
              {appointment.simultaneousCount}/{capacityBoxesCount} posições
            </span>
          ) : null}
          <StatusBadge status={appointment.status} />
        </div>
      </div>

      <div className="mt-2 space-y-0.5 text-sm text-foreground-subtle">
        <p className="text-sm text-foreground">{appointment.customerName ?? "Cliente sem nome cadastrado"}</p>
        <p>{appointment.vehicleLabel}</p>
        <p>{appointment.plate ?? "Placa não informada"}</p>
        <p>{appointment.serviceName}</p>
        {appointment.resolvedDurationMinutes !== null ? <p>{formatDurationMinutes(appointment.resolvedDurationMinutes)}</p> : <p>Tempo previsto não informado</p>}
        {appointment.phone ? (
          <p className="flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {appointment.phone}
          </p>
        ) : null}
      </div>

      {appointment.notes ? <p className="mt-2 rounded-lg bg-background-elevated p-2 text-xs text-foreground-subtle">{appointment.notes}</p> : null}

      <ClientSignalBadges signals={appointment.signals} />

      <div className="mt-3">
        <DayAppointmentActions appointmentId={appointment.id} status={appointment.status} />
      </div>
    </div>
  );
}
