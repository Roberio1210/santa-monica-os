import type { ServiceStatus } from "./service";

export interface ScheduleEntry {
  id: string;
  time: string;
  customerName: string;
  phoneMasked: string;
  vehicleModel: string;
  plateMasked: string;
  service: string;
  estimatedDurationMinutes: number;
  status: ServiceStatus;
  notes?: string;
}

export type AgendaOccupancy = "vazia" | "disponivel" | "moderada" | "cheia";
