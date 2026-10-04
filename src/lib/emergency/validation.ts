import { isKnownCoverageKey } from "@/lib/emergency/insurance";
import { toMailtoHref, toTelHref, toWebsiteHref, toWhatsappHref } from "@/lib/emergency/contact-links";
import {
  EMERGENCY_PRIORITIES,
  isEmergencyContactCategory,
  isEmergencyProtocolCategory,
  type EmergencyContactInput,
  type EmergencyPriority,
  type EmergencyProtocolInput,
  type EmergencyStepInput,
} from "@/lib/emergency/types";

/**
 * Módulo Emergência — validação pura dos formulários administrativos (sem banco, testável
 * isoladamente). Um campo de contato preenchido com valor que não vira link válido é recusado,
 * em vez de gravado e depois escondido em silêncio.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_STEPS = 30;
export const MAX_STEP_LENGTH = 500;
const MAX_TEXT_LENGTH = 2000;

function optional(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseOrder(value: unknown): number | null {
  const str = String(value ?? "").trim();
  if (str === "") return 0;
  const n = Number(str);
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : null;
}

function parsePriority(value: unknown): EmergencyPriority | null {
  const str = String(value ?? "");
  return (EMERGENCY_PRIORITIES as string[]).includes(str) ? (str as EmergencyPriority) : null;
}

export interface RawContactForm {
  name: unknown;
  category: unknown;
  phone: unknown;
  phoneAlt: unknown;
  whatsapp: unknown;
  email: unknown;
  website: unknown;
  priority: unknown;
  displayOrder: unknown;
  notes: unknown;
}

export function validateContactInput(raw: RawContactForm): ValidationResult<EmergencyContactInput> {
  const name = optional(raw.name);
  if (!name) return { ok: false, error: "Informe o nome do contato." };
  if (name.length > 200) return { ok: false, error: "Nome muito longo." };

  const category = String(raw.category ?? "");
  if (!isEmergencyContactCategory(category)) return { ok: false, error: "Categoria inválida." };

  const priority = parsePriority(raw.priority);
  if (!priority) return { ok: false, error: "Prioridade inválida." };

  const displayOrder = parseOrder(raw.displayOrder);
  if (displayOrder === null) return { ok: false, error: "Ordem de exibição deve ser um número inteiro de 0 a 100000." };

  const phone = optional(raw.phone);
  if (phone && !toTelHref(phone)) return { ok: false, error: "Telefone inválido." };
  const phoneAlt = optional(raw.phoneAlt);
  if (phoneAlt && !toTelHref(phoneAlt)) return { ok: false, error: "Telefone alternativo inválido." };
  const whatsapp = optional(raw.whatsapp);
  if (whatsapp && !toWhatsappHref(whatsapp)) return { ok: false, error: "WhatsApp inválido — use o número completo com DDD." };
  const email = optional(raw.email);
  if (email && !toMailtoHref(email)) return { ok: false, error: "E-mail inválido." };
  const website = optional(raw.website);
  if (website && !toWebsiteHref(website)) return { ok: false, error: "Site inválido." };

  const notes = optional(raw.notes);
  if (notes && notes.length > MAX_TEXT_LENGTH) return { ok: false, error: "Observações muito longas." };

  return { ok: true, value: { name, category, phone, phoneAlt, whatsapp, email, website, priority, displayOrder, notes } };
}

/**
 * Passos digitados um por linha, na ordem. Linha iniciada com "!" = passo crítico (destacado).
 * Linhas vazias são ignoradas.
 */
export function parseStepsText(text: string): ValidationResult<EmergencyStepInput[]> {
  const steps: EmergencyStepInput[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    const isCritical = line.startsWith("!");
    if (isCritical) line = line.slice(1).trim();
    if (!line) continue;
    if (line.length > MAX_STEP_LENGTH) return { ok: false, error: `Cada passo pode ter no máximo ${MAX_STEP_LENGTH} caracteres.` };
    steps.push({ text: line, isCritical });
  }
  if (steps.length === 0) return { ok: false, error: "O protocolo precisa de pelo menos um passo." };
  if (steps.length > MAX_STEPS) return { ok: false, error: `Máximo de ${MAX_STEPS} passos por protocolo.` };
  return { ok: true, value: steps };
}

/** Inverso de `parseStepsText` — usado para preencher o formulário de edição. */
export function formatStepsText(steps: { text: string; isCritical: boolean }[]): string {
  return steps.map((s) => (s.isCritical ? `! ${s.text}` : s.text)).join("\n");
}

export interface RawProtocolForm {
  title: unknown;
  category: unknown;
  description: unknown;
  priority: unknown;
  displayOrder: unknown;
  warning: unknown;
  notes: unknown;
  priorityContactId: unknown;
  potentialCoverageKeys: unknown[];
  steps: unknown;
}

export function validateProtocolInput(raw: RawProtocolForm): ValidationResult<EmergencyProtocolInput> {
  const title = optional(raw.title);
  if (!title) return { ok: false, error: "Informe o título do protocolo." };
  if (title.length > 120) return { ok: false, error: "Título muito longo." };

  const category = String(raw.category ?? "");
  if (!isEmergencyProtocolCategory(category)) return { ok: false, error: "Categoria inválida." };

  const description = optional(raw.description);
  if (!description) return { ok: false, error: "Informe a descrição do protocolo." };
  if (description.length > MAX_TEXT_LENGTH) return { ok: false, error: "Descrição muito longa." };

  const priority = parsePriority(raw.priority);
  if (!priority) return { ok: false, error: "Prioridade inválida." };

  const displayOrder = parseOrder(raw.displayOrder);
  if (displayOrder === null) return { ok: false, error: "Ordem de exibição deve ser um número inteiro de 0 a 100000." };

  const warning = optional(raw.warning);
  if (warning && warning.length > MAX_TEXT_LENGTH) return { ok: false, error: "Aviso muito longo." };
  const notes = optional(raw.notes);
  if (notes && notes.length > MAX_TEXT_LENGTH) return { ok: false, error: "Observações muito longas." };

  const coverageKeys = [...new Set(raw.potentialCoverageKeys.map((k) => String(k)))];
  if (coverageKeys.some((k) => !isKnownCoverageKey(k))) return { ok: false, error: "Cobertura desconhecida." };

  const priorityContactId = optional(raw.priorityContactId);

  const steps = parseStepsText(String(raw.steps ?? ""));
  if (!steps.ok) return steps;

  return {
    ok: true,
    value: { title, category, description, priority, displayOrder, warning, notes, potentialCoverageKeys: coverageKeys, priorityContactId, steps: steps.value },
  };
}
