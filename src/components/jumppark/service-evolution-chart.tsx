"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatCurrency } from "@/lib/utils/format";
import type { EvolutionPoint } from "@/lib/integrations/jumppark/serviceAnalytics";

/** Reutilizado para evolução diária/semanal/mensal de Serviços — sempre 2 barras (quantidade, faturamento) no mesmo eixo de tempo. */
export function ServiceEvolutionChart({ points }: { points: EvolutionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="bucket" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis yAxisId="qty" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={32} />
        <YAxis yAxisId="rev" orientation="right" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatCurrency(v)} />
        <Tooltip content={<ChartTooltip formatter={(v) => (v > 1000 ? formatCurrency(v) : String(v))} />} />
        <Bar yAxisId="qty" dataKey="quantity" name="Quantidade" fill="#60a5fa" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="rev" dataKey="revenue" name="Faturamento" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
