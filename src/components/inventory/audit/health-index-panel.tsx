import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthIndexResult } from "@/lib/inventory/health-index";

function scoreColor(score: number): string {
  if (score >= 80) return "bg-positive";
  if (score >= 50) return "bg-warning";
  return "bg-critical";
}

/** Seção 6 — Índice de Saúde do Estoque. Só critérios objetivos (ver health-index.ts); nenhum texto gerado por IA. */
export function HealthIndexPanel({ healthIndex }: { healthIndex: HealthIndexResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Índice de saúde do estoque</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-foreground">{healthIndex.overallScore}</span>
          <span className="text-sm text-foreground-subtle">/ 100</span>
        </div>

        <div className="space-y-3">
          {healthIndex.dimensions.map((dimension) => (
            <div key={dimension.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-muted">
                  {dimension.label} <span className="text-foreground-subtle">(peso {dimension.weight})</span>
                </span>
                <span className="font-medium text-foreground">{dimension.score}/100</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background-elevated">
                <div className={`h-full rounded-full ${scoreColor(dimension.score)}`} style={{ width: `${dimension.score}%` }} />
              </div>
              <p className="mt-1 text-xs text-foreground-subtle">{dimension.detail}</p>
            </div>
          ))}
        </div>

        {healthIndex.topActions.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-foreground-muted">Ações que mais aumentariam o índice</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-foreground-subtle">
              {healthIndex.topActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
