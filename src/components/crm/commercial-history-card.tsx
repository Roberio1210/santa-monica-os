import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { CommercialHistory } from "@/lib/crm-intelligente/types";

function BucketRow({ label, count, totalValue }: { label: string; count: number; totalValue: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-sm">
      <span className="text-foreground">
        {label} <span className="text-foreground-subtle">× {count}</span>
      </span>
      <span className="font-medium text-foreground">{formatCurrency(totalValue)}</span>
    </div>
  );
}

/** "Histórico Comercial" (Missão 21) — agrupado pelos nomes/categorias reais do catálogo (ver `commercialHistory.ts`). */
export function CommercialHistoryCard({ history }: { history: CommercialHistory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Histórico comercial</CardTitle>
        <span className="text-sm font-semibold text-foreground">{formatCurrency(history.totalSpent)}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.packages.length === 0 && history.byCategory.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Nenhum serviço comprado ainda.</p>
        ) : (
          <>
            {history.packages.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground-muted">Pacotes</p>
                {history.packages.map((b) => (
                  <BucketRow key={b.label} {...b} />
                ))}
              </div>
            ) : null}
            {history.byCategory.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground-muted">Demais serviços</p>
                {history.byCategory.map((b) => (
                  <BucketRow key={b.label} {...b} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
