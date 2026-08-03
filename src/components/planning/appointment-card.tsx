import { Phone } from "lucide-react";
import { ClientSignalBadges } from "@/components/planning/client-signals";
import { ConfirmPresence } from "@/components/planning/confirm-presence";
import { StatusBadge } from "@/components/planning/status-badge";
import { formatDurationMinutes } from "@/lib/utils/format";
import { saoPauloTimeHM } from "@/lib/utils/timezone";
import type { AppointmentView } from "@/lib/planning/types";

export function AppointmentCard({ appointment }: { appointment: AppointmentView }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-foreground">{saoPauloTimeHM(new Date(appointment.scheduledAt))}</p>
          <p className="text-sm text-foreground">{appointment.customerName ?? "Cliente sem nome cadastrado"}</p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <div className="mt-2 space-y-0.5 text-sm text-foreground-subtle">
        <p>{appointment.vehicleLabel}{appointment.plate ? ` · ${appointment.plate}` : ""}</p>
        <p>{appointment.serviceName}</p>
        {appointment.expectedDurationMinutes !== null ? <p>{formatDurationMinutes(appointment.expectedDurationMinutes)}</p> : <p>Tempo previsto não informado</p>}
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
        <ConfirmPresence appointmentId={appointment.id} />
      </div>
    </div>
  );
}
