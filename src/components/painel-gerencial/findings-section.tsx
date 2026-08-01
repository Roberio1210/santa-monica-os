import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ManagementFinding } from "@/lib/painel-gerencial/types";

const SEVERITY_VARIANT: Record<ManagementFinding["severity"], "info" | "warning" | "critical"> = {
  info: "info",
  warning: "warning",
  critical: "critical",
};

const SEVERITY_LABEL: Record<ManagementFinding["severity"], string> = {
  info: "Observação",
  warning: "Atenção",
  critical: "Crítico",
};

export function FindingsSection({ findings }: { findings: ManagementFinding[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pontos de atenção</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {findings.map((finding) => (
          <div key={finding.id} className="rounded-lg border border-border-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{finding.title}</p>
              <Badge variant={SEVERITY_VARIANT[finding.severity]}>{SEVERITY_LABEL[finding.severity]}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-foreground-muted sm:grid-cols-2">
              <div>
                <dt className="text-foreground-subtle">Métrica</dt>
                <dd>{finding.metric}</dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">Comparação</dt>
                <dd>{finding.comparison}</dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">Evidência</dt>
                <dd>{finding.evidence}</dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">Período</dt>
                <dd>{finding.period}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-foreground">
              <span className="font-medium">Recomendação:</span> {finding.recommendation}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
