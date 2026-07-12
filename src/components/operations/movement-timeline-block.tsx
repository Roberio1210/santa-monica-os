import { ArrowDownCircle, ArrowUpCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency } from "@/lib/utils/format";
import { buildMovementTimeline, type CentralOverview } from "@/lib/operations/central";

/** Linha do tempo cronológica de hoje — só fontes reais (JumpPark), nenhuma consulta extra. */
export function MovementTimelineBlock({ overview }: { overview: CentralOverview }) {
  const timeline = overview.jumppark.data ? buildMovementTimeline(overview.jumppark.data.orders) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Movimentação do dia
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!overview.jumppark.data ? (
          <Unavailable label={overview.jumppark.error ?? "Informação indisponível"} />
        ) : timeline.length === 0 ? (
          <Unavailable label="Nenhuma movimentação registrada hoje." />
        ) : (
          <ol className="space-y-3">
            {timeline.map((entry, index) => (
              <li key={`${entry.time}-${index}`} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  {entry.label === "Entrada" ? (
                    <ArrowUpCircle className="h-4 w-4 text-info" aria-hidden="true" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 text-positive" aria-hidden="true" />
                  )}
                  {index < timeline.length - 1 ? <span className="mt-1 h-full w-px flex-1 bg-border-subtle" /> : null}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {entry.time} — {entry.label}
                    </p>
                    {entry.amount !== null ? <span className="text-sm font-medium text-positive">{formatCurrency(entry.amount)}</span> : null}
                  </div>
                  <p className="text-xs text-foreground-muted">{entry.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
