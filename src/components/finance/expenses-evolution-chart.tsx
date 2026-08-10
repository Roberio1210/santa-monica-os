"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatCurrency } from "@/lib/utils/format";
import type { MonthlyExpensePoint } from "@/lib/finance/expensesAnalytics";

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1]}/${year.slice(2)}`;
}

export function ExpensesEvolutionChart({ points }: { points: MonthlyExpensePoint[] }) {
  const data = points.map((p) => ({ month: formatMonthLabel(p.month), total: p.total, count: p.count }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="month" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatCurrency(v)} />
        <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
        <Bar dataKey="total" name="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
