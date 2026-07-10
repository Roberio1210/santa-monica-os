"use client";

interface TooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  formatter?: (value: number) => string;
}

export function ChartTooltip({ active, label, payload, formatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-background-elevated p-2.5 text-xs shadow-lg">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center gap-2 text-foreground-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color ?? "var(--color-accent)" }}
            />
            <span>{item.name}:</span>
            <span className="font-medium text-foreground">
              {formatter ? formatter(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
