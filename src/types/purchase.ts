export type PurchaseRecommendation = "comprar" | "aguardar" | "observar";

export interface PurchaseOpportunity {
  id: string;
  product: string;
  currentPrice: number;
  referencePrice: number;
  priceDifferencePercent: number;
  seller: string;
  sellerReputation: number;
  shipping: string;
  deliveryEstimate: string;
  isFull: boolean;
  coupon: string | null;
  recommendation: PurchaseRecommendation;
}
