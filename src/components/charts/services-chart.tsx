"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";

interface ServiceDatum {
  service: string;
  value: number;
}

export function ServicesChart({ data }: { data: ServiceDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" horizontal={false} />
        <XAxis type="number" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="service"
          stroke="var(--color-foreground-subtle)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-background-elevated)" }} />
        <Bar dataKey="value" name="Serviços" fill="#e5e5e6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
