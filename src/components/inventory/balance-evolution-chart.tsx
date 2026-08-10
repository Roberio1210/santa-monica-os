"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import type { BalanceEvolutionPoint } from "@/lib/inventory/stockAnalytics";

/** Evolução do saldo (seção 12) — usa o newBalance real de cada movimentação, já calculado pelo livro-razão (buildBalanceEvolution). */
export function BalanceEvolutionChart({ points }: { points: BalanceEvolutionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="date" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="stepAfter" dataKey="balance" name="Saldo" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
