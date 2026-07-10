/** Indica a origem de um dado exibido na interface. */
export type DataSource = "demo" | "real" | "calculated" | "unavailable";

export interface DataMeta {
  source: DataSource;
  sourceLabel: string;
  updatedAt: string | null;
  syncStatus: "synced" | "syncing" | "error" | "not_configured";
}

export type TrendDirection = "up" | "down" | "flat";

export interface Trend {
  direction: TrendDirection;
  value: number;
  label?: string;
}

export type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix" | "outro";

export type AlertSeverity = "info" | "warning" | "critical";
