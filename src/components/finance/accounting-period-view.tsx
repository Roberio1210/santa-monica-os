"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { closeAccountingPeriodAction, reopenAccountingPeriodAction } from "@/app/financeiro/fechamento/actions";
import type { AccountingPeriodOverview } from "@/lib/finance/service";
import type { AccountingPeriodStatus } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const statusLabels: Record<AccountingPeriodStatus, string> = {
  aberto: "Aberto",
  em_revisao: "Em revisão",
  fechado: "Fechado",
  reaberto: "Reaberto",
};

const statusVariant: Record<AccountingPeriodStatus, "outline" | "warning" | "positive" | "critical"> = {
  aberto: "outline",
  em_revisao: "warning",
  fechado: "positive",
  reaberto: "critical",
};

interface AccountingPeriodViewProps {
  overview: AccountingPeriodOverview;
}

export function AccountingPeriodView({ overview }: AccountingPeriodViewProps) {
  const [closeState, closeAction, closePending] = useActionState(closeAccountingPeriodAction, { error: null });
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenAccountingPeriodAction, { error: null });
  const [showReopen, setShowReopen] = useState(false);

  const status = overview.period?.status ?? "aberto";
  const hasPendencies = overview.pendingClassifications > 0 || overview.overdueAccountsPayable > 0 || overview.unbilledAllocations;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Competência {overview.competenceMonth}</span>
            <Badge variant={statusVariant[status]}>{statusLabels[status]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm">
          <Row label="Lançamentos pendentes de classificação" value={String(overview.pendingClassifications)} warn={overview.pendingClassifications > 0} />
          <Row label="Contas a pagar vencidas na competência" value={String(overview.overdueAccountsPayable)} warn={overview.overdueAccountsPayable > 0} />
          <Row label="Contas a receber em aberto na competência" value={String(overview.openAccountsReceivable)} />
          <Row label="Rateio de despesas compartilhadas" value={overview.unbilledAllocations ? "Não definido" : "Configurado"} warn={overview.unbilledAllocations} />
          {overview.period?.closedBy ? <Row label="Fechado por" value={`${overview.period.closedBy}${overview.period.closedAt ? ` em ${new Date(overview.period.closedAt).toLocaleDateString("pt-BR")}` : ""}`} /> : null}
          {overview.period?.reopenedBy ? <Row label="Reaberto por" value={`${overview.period.reopenedBy} — ${overview.period.reopenJustification ?? ""}`} /> : null}
        </CardContent>
      </Card>

      {status !== "fechado" ? (
        <Card>
          <CardHeader>
            <CardTitle>Fechar competência</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasPendencies ? (
              <p className="mb-2 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
                Há pendências acima — revise antes de fechar (o fechamento não é bloqueado automaticamente, mas fica registrado com essas pendências).
              </p>
            ) : null}
            <form action={closeAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="competenceMonth" value={overview.competenceMonth} />
              <div>
                <label className="block text-xs text-foreground-subtle">Responsável pelo fechamento</label>
                <input name="closedBy" type="text" required className={fieldClasses} />
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="block text-xs text-foreground-subtle">Observação</label>
                <input name="notes" type="text" className={fieldClasses} />
              </div>
              <Button type="submit" disabled={closePending}>
                {closePending ? "Fechando..." : "Fechar competência"}
              </Button>
            </form>
            {closeState.error ? <p className="mt-2 text-xs text-critical">{closeState.error}</p> : null}
            {closeState.success ? <p className="mt-2 text-xs text-positive">{closeState.success}</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Reabrir competência</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!showReopen ? (
              <Button variant="outline" onClick={() => setShowReopen(true)}>
                Reabrir
              </Button>
            ) : (
              <form action={reopenAction} className="space-y-2">
                <input type="hidden" name="competenceMonth" value={overview.competenceMonth} />
                <div>
                  <label className="block text-xs text-foreground-subtle">Responsável pela reabertura</label>
                  <input name="reopenedBy" type="text" required className={fieldClasses} />
                </div>
                <div>
                  <label className="block text-xs text-foreground-subtle">Justificativa (obrigatória)</label>
                  <textarea name="reopenJustification" required rows={2} className={`${fieldClasses} h-auto py-2`} />
                </div>
                <Button type="submit" variant="outline" disabled={reopenPending}>
                  {reopenPending ? "Reabrindo..." : "Confirmar reabertura"}
                </Button>
                {reopenState.error ? <p className="text-xs text-critical">{reopenState.error}</p> : null}
                {reopenState.success ? <p className="text-xs text-positive">{reopenState.success}</p> : null}
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
      <p className="text-foreground-subtle">{label}</p>
      <p className={warn ? "font-medium text-warning" : "text-foreground-muted"}>{value}</p>
    </div>
  );
}
