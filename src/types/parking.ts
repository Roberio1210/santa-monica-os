import type { PaymentMethod } from "./common";

export type ParkingStatus = "presente" | "finalizado";

export interface ParkingEntry {
  id: string;
  plateMasked: string;
  vehicleModel: string;
  customerName: string;
  entryTime: string;
  exitTime: string | null;
  durationMinutes: number | null;
  amount: number;
  paymentMethod: PaymentMethod | null;
  status: ParkingStatus;
}

export interface ParkingSummary {
  vehiclesPresent: number;
  entriesToday: number;
  exitsToday: number;
  occupancyPercent: number;
  revenue: number;
  averageStayMinutes: number;
}
