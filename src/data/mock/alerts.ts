import type { RadarAlert } from "@/types/alert";

export const mockAlerts: RadarAlert[] = [
  {
    id: "alr-001",
    category: "cliente",
    severity: "warning",
    title: "Cliente sem retornar",
    description: "Rodrigo Vieira está há 58 dias sem visitar a estética.",
    createdAt: "2026-07-09T08:00:00-03:00",
  },
  {
    id: "alr-002",
    category: "estoque",
    severity: "critical",
    title: "Estoque crítico",
    description: "Cera de carnaúba abaixo do mínimo — restam 3 unidades.",
    createdAt: "2026-07-09T07:30:00-03:00",
  },
  {
    id: "alr-003",
    category: "agenda",
    severity: "info",
    title: "Horário vago no fim da tarde",
    description: "Vaga disponível às 17:30 — considerar divulgação de última hora.",
    createdAt: "2026-07-09T07:00:00-03:00",
  },
  {
    id: "alr-004",
    category: "marketing",
    severity: "warning",
    title: "Campanha com desempenho baixo",
    description: "'Lavagem expressa fim de semana' com CPL de R$ 44 — acima da média.",
    createdAt: "2026-07-08T19:00:00-03:00",
  },
  {
    id: "alr-005",
    category: "seguranca",
    severity: "info",
    title: "Câmera aguardando integração",
    description: "Câmeras 'Recepção' e 'Pátio de lavação' aguardam ponte local segura.",
    createdAt: "2026-07-08T18:40:00-03:00",
  },
];
