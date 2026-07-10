export type InventoryStatus = "normal" | "atencao" | "critico" | "sem_informacao";

export type InventoryCategory =
  | "shampoos"
  | "desengraxantes"
  | "ceras"
  | "compostos"
  | "produtos_internos"
  | "produtos_couro"
  | "produtos_vidro"
  | "acessorios"
  | "panos"
  | "epis"
  | "embalagens"
  | "outros";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  estimatedQuantity: number;
  unit: string;
  minimumStock: number;
  averageConsumption: number;
  status: InventoryStatus;
  purchaseSuggestion: string | null;
}
