/**
 * Módulo Emergência — Fase 1. Tipos de domínio (espelham `src/db/schema/emergency.ts`).
 */

export type EmergencyPriority = "critica" | "alta" | "normal";

export const EMERGENCY_PRIORITIES: EmergencyPriority[] = ["critica", "alta", "normal"];

export const EMERGENCY_PRIORITY_LABELS: Record<EmergencyPriority, string> = {
  critica: "Crítica",
  alta: "Alta",
  normal: "Normal",
};

/**
 * Categorias de contato, na ordem em que as seções aparecem na Central de Emergência. Texto no
 * banco (não enum) — acrescentar uma categoria aqui não exige migration.
 */
export const EMERGENCY_CONTACT_CATEGORIES = [
  "servico_publico",
  "seguro",
  "interno",
  "seguranca",
  "concessionaria",
  "fornecedor",
  "poder_publico",
  "profissional",
  "outro",
] as const;

export type EmergencyContactCategory = (typeof EMERGENCY_CONTACT_CATEGORIES)[number];

export const EMERGENCY_CONTACT_CATEGORY_LABELS: Record<EmergencyContactCategory, string> = {
  servico_publico: "Serviços públicos de emergência",
  seguro: "Seguro",
  interno: "Responsáveis da Santa Mônica",
  seguranca: "Alarme e segurança",
  concessionaria: "Energia, água e internet",
  fornecedor: "Fornecedores",
  poder_publico: "Poder público municipal",
  profissional: "Apoio profissional",
  outro: "Outros",
};

export function isEmergencyContactCategory(value: string): value is EmergencyContactCategory {
  return (EMERGENCY_CONTACT_CATEGORIES as readonly string[]).includes(value);
}

export const EMERGENCY_PROTOCOL_CATEGORIES = ["vida_seguranca", "veiculo_cliente", "patrimonio", "servico_essencial", "outro"] as const;

export type EmergencyProtocolCategory = (typeof EMERGENCY_PROTOCOL_CATEGORIES)[number];

export const EMERGENCY_PROTOCOL_CATEGORY_LABELS: Record<EmergencyProtocolCategory, string> = {
  vida_seguranca: "Vida e segurança",
  veiculo_cliente: "Veículo de cliente",
  patrimonio: "Patrimônio",
  servico_essencial: "Serviço essencial",
  outro: "Outro",
};

export function isEmergencyProtocolCategory(value: string): value is EmergencyProtocolCategory {
  return (EMERGENCY_PROTOCOL_CATEGORIES as readonly string[]).includes(value);
}

export interface EmergencyContact {
  id: string;
  key: string | null;
  name: string;
  category: string;
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  priority: EmergencyPriority;
  displayOrder: number;
  active: boolean;
  notes: string | null;
  updatedAt: Date;
}

export interface EmergencyProtocol {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  priority: EmergencyPriority;
  displayOrder: number;
  warning: string | null;
  potentialCoverageKeys: string[];
  priorityContactId: string | null;
  active: boolean;
  notes: string | null;
  updatedAt: Date;
}

export interface EmergencyProtocolStep {
  id: string;
  protocolId: string;
  position: number;
  text: string;
  isCritical: boolean;
}

export interface EmergencyProtocolWithSteps extends EmergencyProtocol {
  steps: EmergencyProtocolStep[];
}

/** Campos editáveis de um contato (criação e edição pela tela administrativa). */
export interface EmergencyContactInput {
  name: string;
  category: EmergencyContactCategory;
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  priority: EmergencyPriority;
  displayOrder: number;
  notes: string | null;
}

export interface EmergencyStepInput {
  text: string;
  isCritical: boolean;
}

/** Campos editáveis de um protocolo — o `slug` nunca muda (é a URL do protocolo). */
export interface EmergencyProtocolInput {
  title: string;
  category: EmergencyProtocolCategory;
  description: string;
  priority: EmergencyPriority;
  displayOrder: number;
  warning: string | null;
  potentialCoverageKeys: string[];
  priorityContactId: string | null;
  notes: string | null;
  steps: EmergencyStepInput[];
}

/** Ordenação canônica da Central: ordem de exibição, depois nome/título (desempate estável). */
export function compareByDisplayOrder<T extends { displayOrder: number }>(label: (item: T) => string) {
  return (a: T, b: T): number => a.displayOrder - b.displayOrder || label(a).localeCompare(label(b), "pt-BR");
}
