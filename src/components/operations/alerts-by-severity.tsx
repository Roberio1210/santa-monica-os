import { AlertList } from "@/components/operations/alert-list";
import type { ConsolidatedAlert, ConsolidatedAlertSeverity } from "@/lib/operations/central";

const sectionLabels: Record<ConsolidatedAlertSeverity, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
};

/** Agrupa a mesma lista de alertas (já ordenada por computeConsolidatedAlerts) em 3 colunas por severidade. */
export function AlertsBySeverity({ alerts }: { alerts: ConsolidatedAlert[] }) {
  const groups: ConsolidatedAlertSeverity[] = ["critico", "atencao", "informativo"];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {groups.map((severity) => {
        const items = alerts.filter((a) => a.severity === severity);
        return (
          <div key={severity}>
            <h3 className="mb-2 text-xs font-medium text-foreground-muted">
              {sectionLabels[severity]} ({items.length})
            </h3>
            <AlertList alerts={items} emptyLabel="Nenhum alerta." />
          </div>
        );
      })}
    </div>
  );
}
