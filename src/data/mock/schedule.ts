import type { ScheduleEntry, AgendaOccupancy } from "@/types/schedule";

export const mockSchedule: ScheduleEntry[] = [
  {
    id: "ag-001",
    time: "08:00",
    customerName: "Marcelo Andrade",
    phoneMasked: "(48) 9****-2231",
    vehicleModel: "BMW X1",
    plateMasked: "SMA-**23",
    service: "Vitrificação Premium",
    estimatedDurationMinutes: 240,
    status: "entregue",
  },
  {
    id: "ag-002",
    time: "09:00",
    customerName: "Fernanda Lopes",
    phoneMasked: "(48) 9****-7710",
    vehicleModel: "Jeep Compass",
    plateMasked: "SMB-**87",
    service: "Higienização completa",
    estimatedDurationMinutes: 90,
    status: "entregue",
  },
  {
    id: "ag-003",
    time: "11:15",
    customerName: "Carla Bittencourt",
    phoneMasked: "(48) 9****-6620",
    vehicleModel: "Porsche Macan",
    plateMasked: "SMF-**12",
    service: "PPF frontal",
    estimatedDurationMinutes: 300,
    status: "em_execucao",
    notes: "Cliente VIP — priorizar acabamento",
  },
  {
    id: "ag-004",
    time: "14:30",
    customerName: "Eduardo Konzen",
    phoneMasked: "(48) 9****-1187",
    vehicleModel: "Audi A3",
    plateMasked: "SME-**56",
    service: "Polimento técnico",
    estimatedDurationMinutes: 180,
    status: "revisao",
  },
  {
    id: "ag-005",
    time: "16:30",
    customerName: "Cliente novo",
    phoneMasked: "(48) 9****-3390",
    vehicleModel: "Hyundai HB20",
    plateMasked: "SMH-**33",
    service: "Lavagem completa",
    estimatedDurationMinutes: 60,
    status: "agendado",
  },
  {
    id: "ag-006",
    time: "17:30",
    customerName: "Horário disponível",
    phoneMasked: "—",
    vehicleModel: "—",
    plateMasked: "—",
    service: "Disponível",
    estimatedDurationMinutes: 0,
    status: "agendado",
  },
];

export function getAgendaOccupancy(percentBooked: number): AgendaOccupancy {
  if (percentBooked === 0) return "vazia";
  if (percentBooked < 40) return "disponivel";
  if (percentBooked < 85) return "moderada";
  return "cheia";
}

export const mockAgendaOccupancyPercent = 72;
