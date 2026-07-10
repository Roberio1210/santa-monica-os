"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { formatCurrency } from "@/lib/utils/format";
import type { RevenuePoint } from "@/types/finance";

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="washGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e5e5e6" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#e5e5e6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="parkingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="date" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="var(--color-foreground-subtle)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
          width={44}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v) => formatCurrency(v)}
            />
          }
        />
        <Area type="monotone" dataKey="wash" name="Lavação" stroke="#e5e5e6" fill="url(#washGradient)" strokeWidth={2} />
        <Area type="monotone" dataKey="parking" name="Estacionamento" stroke="#60a5fa" fill="url(#parkingGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
