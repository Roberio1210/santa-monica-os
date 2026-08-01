export type OrderVehicleCategory = "hatch" | "sedan" | "suv" | "caminhonete" | "desconhecido";

export const orderVehicleCategories: OrderVehicleCategory[] = ["hatch", "sedan", "suv", "caminhonete", "desconhecido"];

export type JumpparkServiceMappingStatus = "mapeado" | "nao_mapeado";

export interface ServiceMapping {
  id: string;
  jumpparkServiceName: string;
  canonicalServiceId: string | null;
  canonicalServiceName: string | null;
  status: JumpparkServiceMappingStatus;
  lastValidatedAt: string | null;
  notes: string | null;
}

export interface VehicleCategoryAssignment {
  id: string;
  plateNormalized: string;
  category: OrderVehicleCategory;
  previousCategory: OrderVehicleCategory | null;
  responsibleName: string | null;
  changedAt: string | null;
  reason: string | null;
  notes: string | null;
}

export type ConsumptionConfirmationStatus = "confirmada" | "parcial" | "estornada";

export interface EligibleOrderService {
  description: string;
  amount: number;
}

/** Uma ordem real do JumpPark, finalizada, candidata a análise de consumo — nunca inventada. */
export interface EligibleOrder {
  externalId: string;
  date: string;
  time: string | null;
  clientName: string | null;
  vehicleModel: string;
  plateMasked: string;
  plateNormalized: string | null;
  services: EligibleOrderService[];
  totalAmount: number;
  situation: string;
  /** Confirmação ativa mais recente (não estornada), quando existir — usada para nunca duplicar processamento. */
  activeConfirmationId: string | null;
  /** Última confirmação de qualquer status (inclusive estornada), para exibir histórico. */
  latestConfirmationStatus: ConsumptionConfirmationStatus | null;
}
