import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusVariant } from "@/lib/utils/status";
import { mockSchedule, mockAgendaOccupancyPercent, getAgendaOccupancy } from "@/data/mock/schedule";

const occupancyLabels: Record<string, { label: string; variant: "positive" | "info" | "warning" | "critical" }> = {
  vazia: { label: "Agenda vazia", variant: "info" },
  disponivel: { label: "Disponibilidade boa", variant: "positive" },
  moderada: { label: "Ocupação moderada", variant: "warning" },
  cheia: { label: "Agenda cheia", variant: "critical" },
};

export default function AgendaPage() {
  const occupancy = getAgendaOccupancy(mockAgendaOccupancyPercent);
  const occupancyMeta = occupancyLabels[occupancy];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Agendamentos do dia. Criação e edição reais serão habilitadas em fase futura."
        actions={<DemoDataBadge />}
      />

      <Card>
        <CardContent className="flex items-center justify-between pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Ocupação do dia</p>
            <p className="text-xs text-foreground-muted">{mockAgendaOccupancyPercent}% dos horários preenchidos</p>
          </div>
          <Badge variant={occupancyMeta.variant}>{occupancyMeta.label}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista do dia</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Horário</th>
                  <th className="pb-2 pr-3 font-medium">Cliente</th>
                  <th className="pb-2 pr-3 font-medium">Telefone</th>
                  <th className="pb-2 pr-3 font-medium">Veículo</th>
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Serviço</th>
                  <th className="pb-2 pr-3 font-medium">Duração</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 font-medium">Observações</th>
                </tr>
              </thead>
              <tbody>
                {mockSchedule.map((entry) => (
                  <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-foreground">{entry.time}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{entry.customerName}</td>
                    <td className="py-2 pr-3 text-foreground-subtle">{entry.phoneMasked}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{entry.vehicleModel}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{entry.plateMasked}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{entry.service}</td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {entry.estimatedDurationMinutes > 0 ? `${entry.estimatedDurationMinutes} min` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={statusVariant(entry.status)}>{statusLabel(entry.status)}</Badge>
                    </td>
                    <td className="py-2 text-foreground-subtle">{entry.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
