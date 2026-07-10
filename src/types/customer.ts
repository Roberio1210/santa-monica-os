import type { PaymentMethod } from "./common";

export type CustomerSegment =
  | "novo"
  | "recorrente"
  | "vip"
  | "inativo_30"
  | "inativo_60"
  | "alto_ticket"
  | "oportunidade_retorno";

export interface Customer {
  id: string;
  name: string;
  phoneMasked: string;
  vehicleIds: string[];
  lastVisit: string;
  visitCount: number;
  totalSpent: number;
  averageTicket: number;
  favoriteService: string;
  preferredPaymentMethod: PaymentMethod;
  segments: CustomerSegment[];
}
