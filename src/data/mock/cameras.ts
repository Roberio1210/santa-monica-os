import type { Camera } from "@/types/camera";

export const mockCameras: Camera[] = [
  {
    id: "cam-001",
    name: "Estoque",
    location: "Depósito de produtos",
    model: "Intelbras iM3 C Black",
    ipMasked: "192.168.15.***",
    status: "online",
    lastCheck: "2026-07-09T08:10:00-03:00",
  },
  {
    id: "cam-002",
    name: "Recepção",
    location: "Entrada principal",
    model: "Intelbras iM3 C Black",
    ipMasked: "192.168.15.***",
    status: "sem_informacao",
    lastCheck: "2026-07-08T18:40:00-03:00",
  },
  {
    id: "cam-003",
    name: "Pátio de lavação",
    location: "Área externa",
    model: "Intelbras iM3 C Black",
    ipMasked: "192.168.15.***",
    status: "sem_informacao",
    lastCheck: "2026-07-08T18:40:00-03:00",
  },
];
