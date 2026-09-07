"use client";

import { useActionState, useState } from "react";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { setMonthlyGoalAction, type SetMonthlyGoalActionState } from "@/app/painel-gerencial/actions";
import type { GoalProgress, GoalPace } from "@/lib/goals/types";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Missão 32 — seção de meta mensal consolidada do Painel Gerencial. Server-agnóstica quanto ao
 * dado (recebe `progress` já calculado por `computeGoalProgress`, mesma fonte que alimenta o
 * Zezinho) — só decide como mostrar. CRUD mínimo (Etapa D) embutido: um botão discreto revela um
 * formulário de 2 campos (valor + mês), nunca uma página nova.
 */

const PACE_LABEL: Record<GoalPace, string> = {
  acima_do_ritmo: "Acima do ritmo",
  no_ritmo: "No ritmo",
  abaixo_do_ritmo: "Abaixo do ritmo",
  indeterminado: "Ainda sem dados suficientes",
};

const PACE_VARIANT: Record<GoalPace, "outline" | "positive" | "warning" | "critical" | "info"> = {
  acima_do_ritmo: "positive",
  no_ritmo: "info",
  abaixo_do_ritmo: "critical",
  indeterminado: "outline",
};

const PACE_BAR_COLOR: Record<GoalPace, string> = {
  acima_do_ritmo: "bg-positive",
  no_ritmo: "bg-info",
  abaixo_do_ritmo: "bg-critical",
  indeterminado: "bg-foreground-subtle",
};

const initialState: SetMonthlyGoalActionState = { error: null, success: null };

function GoalForm({ defaultMonth, defaultAmount, onCancel }: { defaultMonth: string; defaultAmount: number | null; onCancel: () => void }) {
  const [state, formAction, isPending] = useActionState(setMonthlyGoalAction, initialState);

  if (state.success) {
    return <p className="text-sm text-positive">{state.success} A página será atualizada.</p>;
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Mês da meta
          <input
            type="month"
            name="month"
            defaultValue={defaultMonth}
            required
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Valor da meta mensal (R$)
          <input
            type="number"
            name="targetAmount"
            min="0.01"
            step="0.01"
            defaultValue={defaultAmount ?? undefined}
            placeholder="50000.00"
            required
            className="w-40 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar meta"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
      </div>
      {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
    </form>
  );
}

export function GoalSection({ monthLabel, monthKey, progress, error }: { monthLabel: string; monthKey: string; progress: GoalProgress | null; error: string | null }) {
  const [editing, setEditing] = useState(false);

  if (!progress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-foreground-subtle" />
            Meta mensal — {monthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {error ? <p className="text-xs text-critical">Faturamento do mês indisponível ({error}) — a meta não pode ser comparada agora.</p> : null}
          {editing ? (
            <GoalForm defaultMonth={monthKey} defaultAmount={null} onCancel={() => setEditing(false)} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-foreground-muted">Meta mensal não definida.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                Definir meta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const barWidth = Number.isFinite(progress.percentComplete) ? Math.max(0, Math.min(100, progress.percentComplete)) : 0;
  const averagePerDay = progress.daysElapsed > 0 ? progress.currentAmount / progress.daysElapsed : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-foreground-subtle" />
          Meta mensal — {progress.goal.label}
        </CardTitle>
        <Badge variant={PACE_VARIANT[progress.pace]}>{PACE_LABEL[progress.pace]}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-foreground-muted">
              {formatCurrency(progress.currentAmount)} de {formatCurrency(progress.goal.targetAmount)}
            </span>
            <span className="font-semibold text-foreground">{progress.percentComplete}%</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-background-elevated">
            <div className={`h-full rounded-full ${PACE_BAR_COLOR[progress.pace]}`} style={{ width: `${barWidth}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard label="Faturamento do mês" value={formatCurrency(progress.currentAmount)} />
          <StatCard label="Meta mensal" value={formatCurrency(progress.goal.targetAmount)} />
          <StatCard label="Falta para a meta" value={formatCurrency(progress.remainingAmount)} />
          <StatCard label="Média por dia" value={averagePerDay !== null ? formatCurrency(averagePerDay) : "—"} hint="dias corridos" />
          <StatCard
            label="Projeção do mês"
            value={progress.projectedAmount !== null ? formatCurrency(progress.projectedAmount) : "—"}
            hint="pelo ritmo atual"
          />
          <StatCard label="Dias decorridos" value={`${progress.daysElapsed} de ${progress.daysTotal}`} hint="dias corridos" />
        </div>

        {error ? <p className="text-xs text-critical">Aviso: faturamento do mês pode estar desatualizado ({error}).</p> : null}

        {editing ? (
          <GoalForm defaultMonth={monthKey} defaultAmount={progress.goal.targetAmount} onCancel={() => setEditing(false)} />
        ) : (
          <div className="flex justify-end border-t border-border-subtle pt-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar meta
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
