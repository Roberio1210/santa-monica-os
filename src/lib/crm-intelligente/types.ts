import type { Customer, DiagnosticArea, ServiceOrderStatus, Vehicle } from "@/lib/attendance/types";
import type { Discount } from "@/lib/manager-assistant/types";

/**
 * CRM Inteligente (Missão 21) — memória completa de cliente e veículo, montada inteiramente a
 * partir de dados reais já existentes (`AttendanceRepository`, `ManagerAssistantRepository`).
 * Nenhum tipo aqui tem escritor/tabela própria: este módulo é só leitura e composição.
 */

export interface CustomerProfile {
  customer: Customer;
  firstVisitAt: string | null;
  daysAsCustomer: number | null;
  visitCount: number;
  vehicleCount: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  totalSpent: number;
  /** Valor médio por Ordem de Serviço com ao menos um item — `null` quando nenhuma ordem tem item ainda (nunca 0). */
  averageTicket: number | null;
  isRecurring: boolean;
  isVip: boolean;
}

export interface VehicleMemory {
  vehicle: Vehicle;
  visitCount: number;
  lastVisitAt: string | null;
}

export interface CrmTimelinePhoto {
  area: DiagnosticArea;
  caption: string | null;
}

/**
 * Uma entrada da timeline do CRM — mais rica que `attendance/timeline.ts` (pensada para a
 * memória completa, não só para a lista de entradas). `services` é o mesmo dado real tanto para
 * "serviços aprovados" quanto para "serviços executados": a Ordem de Serviço só acumula itens
 * quando são aprovados, e só avança de status (execução/conferência/pronto/entregue) depois
 * disso — não existem dois conjuntos diferentes no banco, então nunca inventamos um segundo.
 */
export interface CrmTimelineEntry {
  visitId: string;
  vehicleId: string;
  dateIso: string;
  services: string[];
  diagnosticIssues: string[];
  diagnosticObservations: string | null;
  photos: CrmTimelinePhoto[];
  recommendations: { category: string; observations: string | null }[];
  discounts: Discount[];
  /** Minutos entre entrada e entrega — só quando `status === "entregue"` (mesma regra de `home.ts`). */
  executionMinutes: number | null;
  status: ServiceOrderStatus | null;
}

export interface DiagnosticAreaEvolution {
  area: DiagnosticArea;
  previous: string;
  current: string;
  changed: boolean;
}

export interface ProtectionRecord {
  serviceName: string;
  lastPerformedAt: string;
  daysSince: number;
}

export interface SmartRecommendation {
  id: string;
  label: string;
  reason: string;
}

export interface CommercialHistoryBucket {
  label: string;
  count: number;
  totalValue: number;
}

export interface CommercialHistory {
  totalSpent: number;
  /** Bronze/Silver/Gold/Premium Detail, individualmente — são os pacotes reais do catálogo. */
  packages: CommercialHistoryBucket[];
  /** Demais serviços, agrupados pela categoria real do catálogo (Polimento, Vitrificação, Motor e chassi, Higienização, Vidros, Lavagem, Faróis, Outros). */
  byCategory: CommercialHistoryBucket[];
}

export interface ExecutiveSummary {
  customerSince: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  totalSpent: number;
  averageTicket: number | null;
  vehicleCount: number;
  visitCount: number;
  activeProtectionsCount: number;
  /** Motivo da primeira recomendação inteligente entre todos os veículos — `null` quando não há nenhuma. */
  nextRecommendation: string | null;
}

export interface VehicleCrmDetail {
  vehicle: Vehicle;
  memory: VehicleMemory;
  timeline: CrmTimelineEntry[];
  diagnosticEvolution: DiagnosticAreaEvolution[] | null;
  activeProtections: ProtectionRecord[];
  recommendations: SmartRecommendation[];
}

/** Estrutura preparada, sem implementação (Missão 21: "SEM implementar. Apenas deixar preparada."). */
export type FutureIntegrationStatus = "nao_implementado";

export interface FutureIntegrationSlot {
  status: FutureIntegrationStatus;
  label: string;
}

export interface FutureIntegrationsScaffold {
  agenda: FutureIntegrationSlot;
  financeiro: FutureIntegrationSlot;
  marketing: FutureIntegrationSlot;
  whatsapp: FutureIntegrationSlot;
  estoque: FutureIntegrationSlot;
}

export interface CustomerCrmDetail {
  customer: Customer;
  profile: CustomerProfile;
  executiveSummary: ExecutiveSummary;
  vehicles: VehicleCrmDetail[];
  timeline: CrmTimelineEntry[];
  commercialHistory: CommercialHistory;
  integrations: FutureIntegrationsScaffold;
}

export interface CrmSearchMatch {
  customer: Customer;
  vehicles: Vehicle[];
  profile: CustomerProfile;
}
