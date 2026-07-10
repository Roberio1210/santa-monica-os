"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { formatCurrency } from "@/lib/utils/format";
import type { PaymentBreakdown } from "@/types/finance";

const COLORS = ["#e5e5e6", "#60a5fa", "#22c55e", "#f59e0b", "#a1a1aa"];

export function PaymentMethodsChart({ data }: { data: PaymentBreakdown[] }) {
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="label"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.method} fill={COLORS[index % COLORS.length]} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5 text-xs">
        {data.map((entry, index) => (
          <li key={entry.method} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-foreground-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              {entry.label}
            </span>
            <span className="font-medium text-foreground">{entry.percent.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
