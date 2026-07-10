export type AgentId =
  | "zezinho"
  | "carlos"
  | "bia"
  | "vini"
  | "nina"
  | "eva"
  | "beto"
  | "marta"
  | "radar"
  | "memoria"
  | "vigia";

export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  responsibilities: string[];
  status: "ativo" | "planejado";
}

export interface AgentRecommendation {
  id: string;
  agentId: AgentId;
  title: string;
  description: string;
  category: "contato" | "campanha" | "operacional" | "venda_adicional" | "gestao";
  createdAt: string;
}

/** Estrutura preparada para auditoria futura de ações sugeridas por agentes. */
export interface AgentAuditLog {
  id: string;
  agentId: AgentId;
  suggestedAction: string;
  responsibleUser: string | null;
  timestamp: string;
  source: string;
  approved: boolean | null;
  executed: boolean;
  result: string | null;
}
