import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import type { OperationsEvent } from "@/lib/attendance/operationsCenter";

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Feed cronológico do dia — só eventos reais (ver `buildDayTimeline`), mais recente por último. */
export function DayTimeline({ events }: { events: OperationsEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Linha do Tempo do Dia</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {events.length === 0 ? (
          <p className="py-4 text-center text-sm text-foreground-subtle">Nenhum evento registrado hoje ainda.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono text-xs text-foreground-subtle">{formatClockTime(event.time)}</span>
                <span className="text-foreground-muted">{event.label}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
