import { Phone } from "lucide-react";
import { ClientSignalBadges } from "@/components/planning/client-signals";
import { DayAppointmentActions } from "@/components/planning/day-appointment-actions";
import { StatusBadge } from "@/components/planning/status-badge";
import { formatDurationMinutes } from "@/lib/utils/format";
import { saoPauloTimeHM } from "@/lib/utils/timezone";
import type { DayAppointmentView } from "@/lib/planning/types";

/**
 * Missão 43 (Parte B) — versão compacta do cartão da timeline: horário + rótulo temporal à
 * esquerda, cliente/veículo/serviço/duração/placa numa única linha "escaneável" que quebra em
 * telas menores, indicador de ocupação e status à direita. Mesmos dados de antes (Missão 40),
 * só reorganizados — nenhum campo novo, nenhuma regra nova.
 */
export function DayAppointmentCard({ appointment, capacityBoxesCount, todayIso }: { appointment: DayAppointmentView; capacityBoxesCount: number | null; todayIso: string }) {
  const start = saoPauloTimeHM(new Date(appointment.scheduledAt));
  const end = appointment.endAt ? saoPauloTimeHM(new Date(appointment.endAt)) : null;
  const showOccupancyBadge = appointment.simultaneousCount !== null && capacityBoxesCount !== null;

  return (
    <div className="rounded-xl border border-border-subtle bg-background-panel p-3 sm:flex sm:items-start sm:gap-3">
      <div className="flex items-baseline justify-between gap-2 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start sm:gap-0">
        <p className="text-sm font-semibold text-foreground">{start}</p>
        {end ? <p className="text-xs text-foreground-subtle">– {end}</p> : <p className="text-xs text-warning">Horário final não definido</p>}
      </div>

      <div className="mt-1.5 min-w-0 flex-1 sm:mt-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            {appointment.customerName ?? "Cliente sem nome cadastrado"} <span className="text-foreground-subtle">· {appointment.vehicleLabel}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
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

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground-subtle">
          <span>{appointment.serviceName}</span>
          <span aria-hidden>·</span>
          <span>{appointment.resolvedDurationMinutes !== null ? formatDurationMinutes(appointment.resolvedDurationMinutes) : "Tempo previsto não informado"}</span>
          <span aria-hidden>·</span>
          <span>{appointment.plate ?? "Placa não informada"}</span>
          {appointment.phone ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {appointment.phone}
              </span>
            </>
          ) : null}
        </div>

        <ClientSignalBadges signals={appointment.signals} />

        {appointment.notes ? <p className="mt-1.5 rounded-lg bg-background-elevated p-2 text-xs text-foreground-subtle">{appointment.notes}</p> : null}

        <div className="mt-2">
          <DayAppointmentActions
            appointmentId={appointment.id}
            status={appointment.status}
            scheduledAt={appointment.scheduledAt}
            todayIso={todayIso}
            customerName={appointment.customerName}
          />
        </div>
      </div>
    </div>
  );
}
