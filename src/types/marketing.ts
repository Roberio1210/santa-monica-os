export type CampaignStatus = "ativa" | "pausada" | "encerrada";
export type CampaignRecommendation = "manter" | "observar" | "sugerir_pausa" | "sugerir_aumento" | "sugerir_nova_criacao";

export interface Campaign {
  id: string;
  name: string;
  channel: "meta" | "instagram" | "facebook" | "google";
  status: CampaignStatus;
  investment: number;
  reach: number;
  impressions: number;
  clicks: number;
  messages: number;
  leads: number;
  costPerLead: number;
  recommendation: CampaignRecommendation;
}

export interface MarketingSummary {
  totalInvestment: number;
  totalReach: number;
  totalLeads: number;
  averageCostPerLead: number;
  bestCampaignId: string;
  worstCampaignId: string;
}
