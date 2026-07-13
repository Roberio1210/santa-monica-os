import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateBR } from "@/lib/utils/format";
import type { ConsolidatedAlert } from "@/lib/operations/central";

const severityVariant: Record<ConsolidatedAlert["severity"], "critical" | "warning" | "info"> = {
  critico: "critical",
  atencao: "warning",
  informativo: "info",
};

const severityLabel: Record<ConsolidatedAlert["severity"], string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
};

/** Lista de alertas reutilizada pela Central de Operações (resumo) e por /alertas (lista completa). */
export function AlertList({ alerts, emptyLabel = "Nenhum alerta ativo no momento." }: { alerts: ConsolidatedAlert[]; emptyLabel?: string }) {
  if (alerts.length === 0) {
    return <EmptyState title={emptyLabel} />;
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert, index) => (
        <li key={`${alert.module}-${alert.title}-${index}`} className="rounded-lg border border-border-subtle p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              {alert.severity === "informativo" ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              ) : (
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${alert.severity === "critico" ? "text-critical" : "text-warning"}`} aria-hidden="true" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant[alert.severity]}>{severityLabel[alert.severity]}</Badge>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                </div>
                <p className="text-xs text-foreground-muted">{alert.description}</p>
                <p className="text-xs text-foreground-subtle">
                  {alert.module}
                  {alert.date ? ` · ${formatDateBR(alert.date)}` : ""}
                </p>
              </div>
            </div>
            <Link href={alert.href} className="shrink-0 text-xs text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Ver detalhes
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
