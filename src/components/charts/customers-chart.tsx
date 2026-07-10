"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";

interface CustomersDatum {
  date: string;
  novos: number;
  recorrentes: number;
}

export function CustomersChart({ data }: { data: CustomersDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="date" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={28} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="monotone" dataKey="novos" name="Novos" stroke="#60a5fa" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="recorrentes" name="Recorrentes" stroke="#22c55e" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
