import type { AlertSeverity } from "./common";

export type AlertCategory =
  | "cliente"
  | "financeiro"
  | "agenda"
  | "estoque"
  | "marketing"
  | "seguranca";

export interface RadarAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  createdAt: string;
}
