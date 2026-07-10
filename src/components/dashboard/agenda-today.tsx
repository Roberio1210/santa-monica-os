import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusVariant } from "@/lib/utils/status";
import type { ScheduleEntry } from "@/types/schedule";

export function AgendaToday({ entries }: { entries: ScheduleEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agenda do dia</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                <th className="pb-2 pr-3 font-medium">Horário</th>
                <th className="pb-2 pr-3 font-medium">Cliente</th>
                <th className="pb-2 pr-3 font-medium">Veículo</th>
                <th className="pb-2 pr-3 font-medium">Placa</th>
                <th className="pb-2 pr-3 font-medium">Serviço</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-foreground">{entry.time}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{entry.customerName}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{entry.vehicleModel}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{entry.plateMasked}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{entry.service}</td>
                  <td className="py-2">
                    <Badge variant={statusVariant(entry.status)}>{statusLabel(entry.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
