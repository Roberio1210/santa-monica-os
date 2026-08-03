import { CapacityConfigForm } from "@/components/planning/capacity-config-form";
import { formatDurationMinutes, formatPercent } from "@/lib/utils/format";
import type { TomorrowPreparation as TomorrowPreparationData } from "@/lib/planning/types";

export function TomorrowPreparation({ data }: { data: TomorrowPreparationData }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
      <p className="text-sm font-semibold text-foreground">Preparação de Amanhã</p>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Veículos" value={String(data.vehicleCount)} />
        <Stat label="Serviços previstos" value={String(data.serviceCount)} />
        <Stat label="Tempo total previsto" value={formatDurationMinutes(data.totalPredictedMinutes)} />
        {data.capacity.configured ? <Stat label="Tempo disponível restante" value={formatDurationMinutes(Math.max(0, data.capacity.availableMinutes))} /> : null}
      </div>

      {data.appointmentsMissingDuration > 0 ? (
        <p className="mt-2 text-xs text-warning">
          {data.appointmentsMissingDuration} agendamento(s) sem tempo previsto informado — não entram na soma acima.
        </p>
      ) : null}

      {data.capacity.configured ? (
        <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm text-foreground-subtle">
          <p>
            Capacidade comprometida: {formatPercent(data.capacity.percentOccupied)} ({formatDurationMinutes(data.capacity.committedMinutes)} de {formatDurationMinutes(data.capacity.dailyCapacityMinutes)})
          </p>
          <p>Boxes ocupados (estimado): {data.capacity.estimatedBoxesOccupied.toFixed(1)} de {data.capacity.boxesCount}</p>
          {data.forecast.calculable ? (
            <div>
              <p className="font-medium text-foreground-muted">Ainda cabe:</p>
              <ul className="ml-3 list-disc">
                {data.forecast.entries.map((entry) => (
                  <li key={entry.serviceName}>
                    {entry.canFit} {entry.serviceName}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-foreground-subtle">Capacidade ainda não calculável para pacotes específicos (amostra histórica insuficiente).</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <p className="text-xs text-foreground-subtle">Capacidade ainda não calculável — nenhuma configuração de boxes/expediente definida ainda.</p>
          <CapacityConfigForm />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated p-2.5">
      <p className="text-[11px] text-foreground-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
