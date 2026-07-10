import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { RadarAlert } from "@/types/alert";

const severityConfig = {
  info: { icon: Info, className: "text-info" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  critical: { icon: OctagonAlert, className: "text-critical" },
};

export function RadarAlerts({ alerts }: { alerts: RadarAlert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas do Radar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;
          return (
            <div key={alert.id} className="flex items-start gap-3">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.className)} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{alert.title}</p>
                <p className="text-xs text-foreground-muted">{alert.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
