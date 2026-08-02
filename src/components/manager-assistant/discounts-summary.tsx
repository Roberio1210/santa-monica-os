import Link from "next/link";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { DISCOUNT_REASON_LABELS } from "@/lib/manager-assistant/types";
import type { DiscountsSummary as DiscountsSummaryData } from "@/lib/manager-assistant/service";

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Seção 4 — descontos concedidos sem aprovação prévia; o proprietário só é informado depois (ver notificações). */
export function DiscountsSummary({ data }: { data: DiscountsSummaryData }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatBlock label="Quantidade" value={String(data.count)} />
        <StatBlock label="Valor total" value={formatCurrency(data.totalAmount)} />
        <StatBlock label="% do faturamento" value={data.percentOfRevenue !== null ? formatPercent(data.percentOfRevenue, 1) : "—"} />
        <StatBlock label="Maior desconto" value={data.maxDiscount !== null ? formatCurrency(data.maxDiscount) : "—"} />
      </div>

      {data.items.length === 0 ? (
        <p className="py-2 text-sm text-foreground-subtle">Nenhum desconto concedido hoje.</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((discount) => (
            <Link
              key={discount.id}
              href={`/atendimento/ordens/${discount.serviceOrderId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-panel p-3 transition-colors hover:border-accent/50"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {formatCurrency(discount.discountAmount)} ({discount.discountPercent}%)
                </p>
                <p className="mt-0.5 text-xs text-foreground-subtle">
                  {DISCOUNT_REASON_LABELS[discount.reason]} · {discount.appliedBy} · {formatClockTime(discount.createdAt)}
                </p>
              </div>
              <p className="text-xs text-foreground-subtle">
                {formatCurrency(discount.originalValue)} → {formatCurrency(discount.finalValue)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-panel p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
