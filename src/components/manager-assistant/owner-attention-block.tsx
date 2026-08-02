import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import type { OwnerAttentionSnapshot } from "@/lib/manager-assistant/service";

/** Seção 7 — bloco compacto na Central de Operações: o proprietário entende a situação em menos de 10 segundos. */
export function OwnerAttentionBlock({ snapshot }: { snapshot: OwnerAttentionSnapshot }) {
  return (
    <Card className={snapshot.criticalAlerts > 0 ? "border-critical/40" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-foreground-subtle" />
          Precisa da sua atenção
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <AttentionStat label="Alertas críticos" value={String(snapshot.criticalAlerts)} emphasis={snapshot.criticalAlerts > 0} />
          <AttentionStat label="Descontos hoje" value={formatCurrency(snapshot.discountsToday.totalAmount)} hint={`${snapshot.discountsToday.count} desconto(s)`} />
          <AttentionStat label="Ordens sem valor" value={String(snapshot.ordersWithoutValue)} emphasis={snapshot.ordersWithoutValue > 0} />
          <AttentionStat label="Acima do tempo" value={String(snapshot.overdueInExecution)} emphasis={snapshot.overdueInExecution > 0} />
          <AttentionStat label="Prontos aguardando" value={String(snapshot.readyForPickup)} />
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/assistente-gerente">
            <Sparkles className="h-4 w-4" />
            Abrir Assistente
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AttentionStat({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-panel p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${emphasis ? "text-critical" : "text-foreground"}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}
