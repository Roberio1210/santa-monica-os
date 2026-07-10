"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";

interface VehiclesChartData {
  date: string;
  lavacao: number;
  estacionamento: number;
}

export function VehiclesChart({ data }: { data: VehiclesChartData[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="date" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={28} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-background-elevated)" }} />
        <Bar dataKey="lavacao" name="Lavação" fill="#e5e5e6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="estacionamento" name="Estacionamento" fill="#60a5fa" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
