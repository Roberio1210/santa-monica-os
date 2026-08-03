import { Phone, Sparkles } from "lucide-react";
import { ClientSignalBadges } from "@/components/planning/client-signals";
import { ConfirmPresence } from "@/components/planning/confirm-presence";
import { recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { formatDateBR, formatDurationMinutes } from "@/lib/utils/format";
import { saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";
import type { NextClientCard as NextClientCardData } from "@/lib/planning/types";

export function NextClientCard({ data }: { data: NextClientCardData | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle p-4 text-center text-sm text-foreground-subtle">
        Nenhum próximo agendamento confirmado ou aguardando confirmação.
      </div>
    );
  }

  const { appointment } = data;

  return (
    <div className="rounded-2xl border border-accent/40 bg-background-panel p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-accent">
        <Sparkles className="h-4 w-4" />
        Próximo cliente
      </div>

      <p className="mt-2 text-lg font-semibold text-foreground">{appointment.customerName ?? "Cliente sem nome cadastrado"}</p>
      <p className="text-sm text-foreground-subtle">
        {saoPauloTimeHM(new Date(appointment.scheduledAt))} · {appointment.serviceName}
      </p>
      <p className="text-sm text-foreground-subtle">{appointment.vehicleLabel}{appointment.plate ? ` · ${appointment.plate}` : ""}</p>
      {appointment.phone ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-subtle">
          <Phone className="h-3.5 w-3.5" />
          {appointment.phone}
        </p>
      ) : null}
      {appointment.notes ? <p className="mt-2 rounded-lg bg-background-elevated p-2 text-xs text-foreground-subtle">{appointment.notes}</p> : null}

      <ClientSignalBadges signals={appointment.signals} />

      <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-xs text-foreground-subtle">
        <p>Última visita: {data.lastVisitAt ? formatDateBR(saoPauloDateISO(new Date(data.lastVisitAt))) : "Sem histórico registrado"}</p>
        {data.lastServiceNames.length > 0 ? <p>Último serviço: {data.lastServiceNames.join(", ")}</p> : null}
        {data.lastDiagnosticIssues.length > 0 ? (
          <div>
            <p className="font-medium text-foreground-muted">Pendências encontradas na última inspeção:</p>
            <ul className="ml-3 list-disc">
              {data.lastDiagnosticIssues.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.pendingRecommendations.length > 0 ? (
          <div>
            <p className="font-medium text-foreground-muted">Recomendações técnicas ainda sem retorno:</p>
            <ul className="ml-3 list-disc">
              {data.pendingRecommendations.map((r, idx) => (
                <li key={`${r.category}-${idx}`}>
                  {recommendationCategoryLabel(r.category)}
                  {r.observations ? ` — ${r.observations}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {appointment.expectedDurationMinutes !== null ? <p>Tempo previsto: {formatDurationMinutes(appointment.expectedDurationMinutes)}</p> : null}
      </div>

      <div className="mt-3">
        <ConfirmPresence appointmentId={appointment.id} />
      </div>
    </div>
  );
}
