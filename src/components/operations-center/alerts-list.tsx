import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OperationalAlert } from "@/lib/attendance/operationsCenter";

/** Alertas operacionais — só aparecem quando algum card já ultrapassou o limiar real (ver `deriveOperationalAlerts`); a seção some quando não há nenhum. */
export function AlertsList({ alerts }: { alerts: OperationalAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <AlertTriangle className="h-4 w-4" />
          Alertas Operacionais · {alerts.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            href={`/atendimento/ordens/${alert.serviceOrderId}`}
            className="block rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning transition-colors hover:border-warning/60"
          >
            {alert.message}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
