import type { CostCenter } from "@/lib/finance/types";

/** Espelha os centros de custo reais do banco (src/db/seed/chart-of-accounts.ts). */
export const initialCostCenters: CostCenter[] = [
  { id: "cc-estacionamento", name: "Estacionamento" },
  { id: "cc-lavacao", name: "Lavação" },
  { id: "cc-administrativo", name: "Administrativo" },
  { id: "cc-marketing", name: "Marketing" },
  { id: "cc-estrutura", name: "Estrutura" },
  { id: "cc-tecnologia", name: "Tecnologia" },
  { id: "cc-estetica-automotiva", name: "Estética Automotiva" },
];
