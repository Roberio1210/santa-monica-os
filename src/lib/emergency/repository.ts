import type {
  EmergencyContact,
  EmergencyContactInput,
  EmergencyProtocol,
  EmergencyProtocolInput,
  EmergencyProtocolStep,
  EmergencyProtocolWithSteps,
} from "@/lib/emergency/types";

/**
 * Módulo Emergência — contrato de persistência (mesmo padrão dual-mode do projeto: memória sem
 * banco, Postgres com banco). Toda escrita é administrativa e grava `audit_logs` na mesma
 * transação. `expectedUpdatedAt` (ISO) é o controle de concorrência otimista: se outra pessoa
 * salvou antes, a escrita é recusada com `EmergencyConcurrentUpdateError`, nunca sobrescreve.
 */
export interface EmergencyRepository {
  listContacts(options: { includeInactive: boolean }): Promise<EmergencyContact[]>;
  listProtocols(options: { includeInactive: boolean }): Promise<EmergencyProtocol[]>;
  /** Passos de vários protocolos numa única consulta (tela administrativa) — nunca um por protocolo. */
  listStepsForProtocols(protocolIds: string[]): Promise<EmergencyProtocolStep[]>;
  /** Protocolo + passos ordenados, ativo ou não (o chamador decide o que exibir). */
  getProtocolBySlug(slug: string): Promise<EmergencyProtocolWithSteps | null>;

  createContact(input: EmergencyContactInput, actorUserId: string): Promise<EmergencyContact>;
  updateContact(id: string, input: EmergencyContactInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact>;
  setContactActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact>;
  updateProtocol(id: string, input: EmergencyProtocolInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocolWithSteps>;
  setProtocolActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocol>;
}

export class EmergencyNotFoundError extends Error {
  constructor(entity: "contato" | "protocolo") {
    super(entity === "contato" ? "Contato não encontrado." : "Protocolo não encontrado.");
    this.name = "EmergencyNotFoundError";
  }
}

export class EmergencyConcurrentUpdateError extends Error {
  constructor() {
    super("Este cadastro foi alterado por outra pessoa enquanto você editava. Recarregue a página e tente de novo.");
    this.name = "EmergencyConcurrentUpdateError";
  }
}

/** Mesma truncagem em milissegundos usada pelo Postgres no CAS (`date_trunc('milliseconds', ...)`). */
export function sameUpdatedAt(current: Date, expectedIso: string): boolean {
  const expected = new Date(expectedIso);
  return !Number.isNaN(expected.getTime()) && current.getTime() === expected.getTime();
}
