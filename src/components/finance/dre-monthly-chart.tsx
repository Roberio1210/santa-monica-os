"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatCurrency } from "@/lib/utils/format";
import type { DreMonthlyPoint } from "@/lib/finance/service";

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1]}/${year.slice(2)}`;
}

/**
 * Missão Financeiro V3.0 — evolução mensal da DRE. Meses "não calculáveis" (sem nenhum lançamento
 * real de receita) são deliberadamente omitidos da LINHA do gráfico (nunca desenhados como 0) —
 * a tabela abaixo do gráfico (renderizada por quem usa este componente) é que mostra o "não
 * calculável" explícito por mês, mesmo padrão de ausência-de-dado-≠-zero usado no resto da DRE.
 */
export function DreMonthlyChart({ points }: { points: DreMonthlyPoint[] }) {
  const data = points
    .filter((p) => p.report.receitaBruta !== null)
    .map((p) => ({
      month: formatMonthLabel(p.month),
      receitaBruta: p.report.receitaBruta,
      resultadoOperacional: p.report.resultadoOperacional,
      resultadoGerencial: p.report.resultadoLiquido,
    }));

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-foreground-subtle">Nenhum mês do período selecionado tem receita calculável.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="month" stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--color-foreground-subtle)" fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatCurrency(v)} />
        <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="receitaBruta" name="Receita bruta" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="resultadoOperacional" name="Resultado operacional" stroke="#facc15" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="resultadoGerencial" name="Resultado gerencial" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
