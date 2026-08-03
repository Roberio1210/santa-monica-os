import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import type { DataQualityIssue, IssueSeverity } from "@/lib/inventory/data-quality-audit";
import type { InventoryItem } from "@/lib/inventory/types";

const severityVariant: Record<IssueSeverity, "critical" | "warning" | "info"> = {
  critico: "critical",
  atencao: "warning",
  informativo: "info",
};

const severityLabel: Record<IssueSeverity, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
};

/** Seção 5 — Qualidade de Dados. Nunca corrige nada sozinho: o "botão de correção" só leva à tela onde o cadastro é editado manualmente. */
export function DataQualityList({ issues, itemById }: { issues: DataQualityIssue[]; itemById: Record<string, InventoryItem> }) {
  const sorted = [...issues].sort((a, b) => (severityRank(b.severity) - severityRank(a.severity)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qualidade de dados</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {sorted.length === 0 ? (
          <EmptyState title="Nenhum problema encontrado" description="Todos os produtos passaram nas regras de qualidade de dados." />
        ) : (
          <ul className="space-y-2">
            {sorted.map((issue) => {
              const item = itemById[issue.itemId];
              return (
                <li key={issue.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{item?.name ?? "Produto"}</span>
                    <Badge variant={severityVariant[issue.severity]}>{severityLabel[issue.severity]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-foreground-muted">
                    <span className="font-medium text-foreground-subtle">{issue.title}:</span> {issue.explanation}
                  </p>
                  <p className="mt-1 text-xs text-foreground-subtle">Ação recomendada: {issue.recommendedAction}</p>
                  {item ? (
                    <div className="mt-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/estoque/produtos/${item.id}`}>Corrigir cadastro</Link>
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function severityRank(severity: IssueSeverity): number {
  return severity === "critico" ? 3 : severity === "atencao" ? 2 : 1;
}
