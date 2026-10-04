import "server-only";
import { cache } from "react";
import { getEmergencyRepository } from "@/lib/emergency/repository-factory";
import { MemoryEmergencyRepository } from "@/lib/emergency/memory-repository";
import { resolveCoverages, type InsuranceCoverage } from "@/lib/emergency/insurance";
import { toTelHref } from "@/lib/emergency/contact-links";
import type { EmergencyRepository } from "@/lib/emergency/repository";
import type { EmergencyContact, EmergencyContactInput, EmergencyProtocol, EmergencyProtocolInput, EmergencyProtocolStep, EmergencyProtocolWithSteps } from "@/lib/emergency/types";

/**
 * Módulo Emergência — Fase 1. Camada de leitura da Central e de escrita administrativa.
 *
 * Performance (Neon): a Central faz 2 consultas por acesso (contatos + protocolos, em paralelo);
 * a página de protocolo faz 3 (protocolo, passos, contatos). Nenhuma leitura de passos de todos os
 * protocolos na página principal, nenhum polling, nenhuma consulta por item. `React.cache()`
 * deduplica dentro da mesma requisição.
 *
 * Contingência: a Central de Emergência nunca pode ficar em branco. Se o banco falhar (ou as
 * tabelas ainda não tiverem sido carregadas pelo seed), a página usa o conteúdo inicial
 * (`seed-data.ts`) e avisa claramente que está em modo de contingência — os números públicos
 * (190/193/199) e os protocolos continuam disponíveis.
 */

export type EmergencyDataMode = "normal" | "contingencia" | "nao_inicializado";

export interface EmergencyCentralData {
  mode: EmergencyDataMode;
  contacts: EmergencyContact[];
  protocols: EmergencyProtocol[];
}

export interface EmergencyProtocolView {
  mode: EmergencyDataMode;
  protocol: EmergencyProtocolWithSteps;
  priorityContact: EmergencyContact | null;
  publicEmergencyContacts: EmergencyContact[];
  potentialCoverages: InsuranceCoverage[];
}

let fallbackRepository: MemoryEmergencyRepository | null = null;

function getFallbackRepository(): EmergencyRepository {
  fallbackRepository ??= new MemoryEmergencyRepository();
  return fallbackRepository;
}

function logFailure(context: string, error: unknown): void {
  console.error(`[emergencia] ${context} — usando conteúdo de contingência:`, error instanceof Error ? error.message : error);
}

async function loadCentral(repository: EmergencyRepository): Promise<{ contacts: EmergencyContact[]; protocols: EmergencyProtocol[] }> {
  const [contacts, protocols] = await Promise.all([repository.listContacts({ includeInactive: false }), repository.listProtocols({ includeInactive: false })]);
  return { contacts, protocols };
}

export const fetchEmergencyCentral = cache(async function fetchEmergencyCentral(): Promise<EmergencyCentralData> {
  try {
    const data = await loadCentral(getEmergencyRepository());
    if (data.contacts.length === 0 && data.protocols.length === 0) {
      return { mode: "nao_inicializado", ...(await loadCentral(getFallbackRepository())) };
    }
    return { mode: "normal", ...data };
  } catch (error) {
    logFailure("falha ao carregar a Central", error);
    return { mode: "contingencia", ...(await loadCentral(getFallbackRepository())) };
  }
});

export function selectPublicEmergencyContacts(contacts: EmergencyContact[]): EmergencyContact[] {
  return contacts.filter((c) => c.category === "servico_publico" && c.active);
}

export interface HighlightedContacts {
  /** Serviços públicos de emergência com telefone válido (190/192/193/199), na ordem configurada. */
  publicServices: EmergencyContact[];
  /** Demais contatos de prioridade crítica com telefone válido (ex.: Tokio Marine — Assistência 24h). */
  otherCritical: EmergencyContact[];
}

/**
 * Contatos de acesso imediato no topo da Central (Missão 2.1): prioridade "crítica" + telefone
 * válido. Quem aparece aqui não se repete na lista geral de contatos — sem duplicidade na mesma
 * tela de contatos. Contato crítico sem telefone nunca entra (não existe botão vazio).
 */
export function selectHighlightedContacts(contacts: EmergencyContact[]): HighlightedContacts {
  const highlighted = contacts.filter((c) => c.active && c.priority === "critica" && toTelHref(c.phone) !== null);
  return {
    publicServices: highlighted.filter((c) => c.category === "servico_publico"),
    otherCritical: highlighted.filter((c) => c.category !== "servico_publico"),
  };
}

async function buildProtocolView(repository: EmergencyRepository, slug: string, mode: EmergencyDataMode): Promise<EmergencyProtocolView | null> {
  const [protocol, contacts] = await Promise.all([repository.getProtocolBySlug(slug), repository.listContacts({ includeInactive: false })]);
  if (!protocol || !protocol.active) return null;
  return {
    mode,
    protocol,
    priorityContact: protocol.priorityContactId ? (contacts.find((c) => c.id === protocol.priorityContactId) ?? null) : null,
    publicEmergencyContacts: selectPublicEmergencyContacts(contacts),
    potentialCoverages: resolveCoverages(protocol.potentialCoverageKeys),
  };
}

/** `null` = protocolo inexistente ou inativo (a página responde 404). */
export const fetchEmergencyProtocol = cache(async function fetchEmergencyProtocol(slug: string): Promise<EmergencyProtocolView | null> {
  try {
    const view = await buildProtocolView(getEmergencyRepository(), slug, "normal");
    if (view) return view;
    // Banco respondeu mas sem nenhum protocolo carregado (seed ainda não rodou) — mesma regra da Central.
    const protocols = await getEmergencyRepository().listProtocols({ includeInactive: true });
    if (protocols.length === 0) return buildProtocolView(getFallbackRepository(), slug, "nao_inicializado");
    return null;
  } catch (error) {
    logFailure(`falha ao carregar o protocolo "${slug}"`, error);
    return buildProtocolView(getFallbackRepository(), slug, "contingencia");
  }
});

// ---------------------------------------------------------------------------------------------
// Administração (só chamada pelas server actions, depois de `requireAdmin`, e pela página admin)
// ---------------------------------------------------------------------------------------------

export interface EmergencyAdminData {
  contacts: EmergencyContact[];
  protocols: (EmergencyProtocol & { steps: EmergencyProtocolStep[] })[];
}

/** 3 consultas no total (contatos, protocolos, passos de todos os protocolos num único `inArray`). */
export async function fetchEmergencyAdminData(): Promise<EmergencyAdminData> {
  const repository = getEmergencyRepository();
  const [contacts, protocols] = await Promise.all([repository.listContacts({ includeInactive: true }), repository.listProtocols({ includeInactive: true })]);
  const steps = await repository.listStepsForProtocols(protocols.map((p) => p.id));
  const stepsByProtocol = new Map<string, EmergencyProtocolStep[]>();
  for (const step of steps) {
    const list = stepsByProtocol.get(step.protocolId) ?? [];
    list.push(step);
    stepsByProtocol.set(step.protocolId, list);
  }
  return { contacts, protocols: protocols.map((p) => ({ ...p, steps: (stepsByProtocol.get(p.id) ?? []).sort((a, b) => a.position - b.position) })) };
}

export class EmergencyInvalidPriorityContactError extends Error {
  constructor() {
    super("Contato prioritário inválido.");
    this.name = "EmergencyInvalidPriorityContactError";
  }
}

export function createEmergencyContact(input: EmergencyContactInput, actorUserId: string): Promise<EmergencyContact> {
  return getEmergencyRepository().createContact(input, actorUserId);
}

export function updateEmergencyContact(id: string, input: EmergencyContactInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact> {
  return getEmergencyRepository().updateContact(id, input, expectedUpdatedAt, actorUserId);
}

export function setEmergencyContactActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact> {
  return getEmergencyRepository().setContactActive(id, active, expectedUpdatedAt, actorUserId);
}

export async function updateEmergencyProtocol(id: string, input: EmergencyProtocolInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocolWithSteps> {
  const repository = getEmergencyRepository();
  if (input.priorityContactId) {
    const contacts = await repository.listContacts({ includeInactive: false });
    if (!contacts.some((c) => c.id === input.priorityContactId)) throw new EmergencyInvalidPriorityContactError();
  }
  return repository.updateProtocol(id, input, expectedUpdatedAt, actorUserId);
}

export function setEmergencyProtocolActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocol> {
  return getEmergencyRepository().setProtocolActive(id, active, expectedUpdatedAt, actorUserId);
}
