import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmergencyRepository, resetEmergencyRepositoryForTests } from "@/lib/emergency/repository-factory";
import { MemoryEmergencyRepository } from "@/lib/emergency/memory-repository";
import { EmergencyConcurrentUpdateError } from "@/lib/emergency/repository";
import {
  createEmergencyContact,
  EmergencyInvalidPriorityContactError,
  fetchEmergencyAdminData,
  fetchEmergencyCentral,
  fetchEmergencyProtocol,
  selectHighlightedContacts,
  setEmergencyContactActive,
  setEmergencyProtocolActive,
  updateEmergencyContact,
  updateEmergencyProtocol,
} from "@/lib/emergency/service";
import type { EmergencyContactInput, EmergencyProtocolInput } from "@/lib/emergency/types";

/**
 * Módulo Emergência (Fase 1) — camada de serviço no modo memória (o padrão da suíte; nunca toca
 * o banco). `React.cache()` não deduplica fora de um render do React, então cada chamada aqui
 * lê o estado atual do repositório.
 */

const ACTOR = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  resetEmergencyRepositoryForTests();
  vi.restoreAllMocks();
});

function memoryRepository(): MemoryEmergencyRepository {
  const repository = getEmergencyRepository();
  expect(repository).toBeInstanceOf(MemoryEmergencyRepository);
  return repository as MemoryEmergencyRepository;
}

function contactInput(overrides: Partial<EmergencyContactInput> = {}): EmergencyContactInput {
  return { name: "Contato Teste", category: "outro", phone: null, phoneAlt: null, whatsapp: null, email: null, website: null, priority: "normal", displayOrder: 999, notes: null, ...overrides };
}

describe("fetchEmergencyCentral", () => {
  it("modo normal, com contatos e protocolos ativos ordenados por ordem de exibição", async () => {
    const { mode, contacts, protocols } = await fetchEmergencyCentral();
    expect(mode).toBe("normal");
    expect(contacts.map((c) => c.displayOrder)).toEqual([...contacts.map((c) => c.displayOrder)].sort((a, b) => a - b));
    expect(contacts.slice(0, 4).map((c) => c.phone)).toEqual(["190", "192", "193", "199"]);
    expect(protocols).toHaveLength(12);
    expect(protocols[0].slug).toBe("incendio");
    expect(protocols[11].slug).toBe("outra-emergencia");
  });

  it("contato e protocolo desativados não aparecem na Central", async () => {
    const before = await fetchEmergencyCentral();
    const celesc = before.contacts.find((c) => c.key === "celesc")!;
    const internet = before.protocols.find((p) => p.slug === "internet")!;
    await setEmergencyContactActive(celesc.id, false, celesc.updatedAt.toISOString(), ACTOR);
    await setEmergencyProtocolActive(internet.id, false, internet.updatedAt.toISOString(), ACTOR);

    const after = await fetchEmergencyCentral();
    expect(after.contacts.some((c) => c.key === "celesc")).toBe(false);
    expect(after.protocols.some((p) => p.slug === "internet")).toBe(false);
    expect(await fetchEmergencyProtocol("internet")).toBeNull();
  });

  it("empate de ordem é desempatado por nome (ordenação estável)", async () => {
    await createEmergencyContact(contactInput({ name: "Zeta", displayOrder: 5 }), ACTOR);
    await createEmergencyContact(contactInput({ name: "Alfa", displayOrder: 5 }), ACTOR);
    const { contacts } = await fetchEmergencyCentral();
    expect(contacts.slice(0, 2).map((c) => c.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("banco fora do ar -> modo de contingência com o conteúdo inicial (nunca página em branco)", async () => {
    const repository = memoryRepository();
    vi.spyOn(repository, "listContacts").mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { mode, contacts, protocols } = await fetchEmergencyCentral();
    expect(mode).toBe("contingencia");
    expect(contacts.filter((c) => c.category === "servico_publico").map((c) => c.phone)).toEqual(["190", "192", "193", "199"]);
    expect(protocols).toHaveLength(12);
  });

  it("banco respondendo mas sem nada carregado -> 'nao_inicializado' com o conteúdo inicial", async () => {
    const repository = memoryRepository();
    vi.spyOn(repository, "listContacts").mockResolvedValue([]);
    vi.spyOn(repository, "listProtocols").mockResolvedValue([]);

    const { mode, protocols } = await fetchEmergencyCentral();
    expect(mode).toBe("nao_inicializado");
    expect(protocols).toHaveLength(12);
  });
});

describe("selectHighlightedContacts", () => {
  it("destaque imediato: 190, 192, 193, 199 e Tokio Marine 0800 31 86546 — só contatos críticos com telefone válido", async () => {
    const { contacts } = await fetchEmergencyCentral();
    const { publicServices, otherCritical } = selectHighlightedContacts(contacts);
    expect(publicServices.map((c) => [c.name, c.phone])).toEqual([
      ["Polícia Militar", "190"],
      ["SAMU", "192"],
      ["Corpo de Bombeiros", "193"],
      ["Defesa Civil", "199"],
    ]);
    expect(otherCritical.map((c) => [c.name, c.phone])).toEqual([["Tokio Marine — Assistência 24h", "0800 31 86546"]]);
  });

  it("contato crítico sem telefone válido nunca entra no destaque (sem botão vazio)", async () => {
    const created = await createEmergencyContact(contactInput({ name: "Crítico sem telefone", priority: "critica" }), ACTOR);
    const { contacts } = await fetchEmergencyCentral();
    const { publicServices, otherCritical } = selectHighlightedContacts(contacts);
    expect([...publicServices, ...otherCritical].some((c) => c.id === created.id)).toBe(false);
  });
});

describe("fetchEmergencyProtocol", () => {
  it("passos em ordem crescente de posição, contato prioritário e cobertura potencial resolvidos", async () => {
    const view = await fetchEmergencyProtocol("incendio");
    expect(view).not.toBeNull();
    expect(view!.protocol.steps.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(view!.priorityContact?.phone).toBe("193");
    expect(view!.potentialCoverages.map((c) => c.key)).toEqual(["incendio"]);
    expect(view!.publicEmergencyContacts.map((c) => c.phone)).toEqual(["190", "192", "193", "199"]);
  });

  it("Acidente com pessoa: SAMU 192 como contato prioritário e nenhuma cobertura vinculada", async () => {
    const view = (await fetchEmergencyProtocol("acidente-pessoa"))!;
    expect(view.priorityContact?.name).toBe("SAMU");
    expect(view.priorityContact?.phone).toBe("192");
    expect(view.potentialCoverages).toEqual([]);
  });

  it("protocolo inexistente -> null (404)", async () => {
    expect(await fetchEmergencyProtocol("nao-existe")).toBeNull();
  });

  it("contato prioritário desativado não é exibido", async () => {
    const { contacts } = await fetchEmergencyCentral();
    const bombeiros = contacts.find((c) => c.key === "bombeiros")!;
    await setEmergencyContactActive(bombeiros.id, false, bombeiros.updatedAt.toISOString(), ACTOR);
    expect((await fetchEmergencyProtocol("incendio"))!.priorityContact).toBeNull();
  });

  it("banco fora do ar -> protocolo vem do conteúdo inicial, em contingência", async () => {
    const repository = memoryRepository();
    vi.spyOn(repository, "getProtocolBySlug").mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = await fetchEmergencyProtocol("dano-veiculo");
    expect(view?.mode).toBe("contingencia");
    expect(view?.protocol.steps).toHaveLength(14);
  });
});

describe("administração (repositório) — auditoria e concorrência", () => {
  it("toda escrita gera registro de auditoria com o autor", async () => {
    const repository = memoryRepository();
    const created = await createEmergencyContact(contactInput(), ACTOR);
    await updateEmergencyContact(created.id, contactInput({ phone: "(48) 3333-0000" }), created.updatedAt.toISOString(), ACTOR);
    expect(repository.auditEntries.map((e) => [e.action, e.entityId, e.actorUserId])).toEqual([
      ["emergency_contact_created", created.id, ACTOR],
      ["emergency_contact_updated", created.id, ACTOR],
    ]);
    expect(repository.auditEntries[1].beforeState).toMatchObject({ phone: null });
    expect(repository.auditEntries[1].afterState).toMatchObject({ phone: "(48) 3333-0000" });
  });

  it("edição com versão desatualizada é recusada — nunca sobrescreve a alteração de outra pessoa", async () => {
    const created = await createEmergencyContact(contactInput(), ACTOR);
    const staleVersion = created.updatedAt.toISOString();
    await updateEmergencyContact(created.id, contactInput({ name: "Primeira edição" }), staleVersion, ACTOR);
    await expect(updateEmergencyContact(created.id, contactInput({ name: "Segunda edição" }), staleVersion, ACTOR)).rejects.toBeInstanceOf(EmergencyConcurrentUpdateError);
  });

  it("edição de protocolo substitui os passos na nova ordem e guarda o estado anterior na auditoria", async () => {
    const repository = memoryRepository();
    const before = (await fetchEmergencyProtocol("internet"))!.protocol;
    const input: EmergencyProtocolInput = {
      title: before.title,
      category: "servico_essencial",
      description: before.description,
      priority: before.priority,
      displayOrder: before.displayOrder,
      warning: null,
      potentialCoverageKeys: [],
      priorityContactId: before.priorityContactId,
      notes: "Roteador fica no escritório.",
      steps: [
        { text: "Passo B", isCritical: false },
        { text: "Passo A", isCritical: true },
      ],
    };
    await updateEmergencyProtocol(before.id, input, before.updatedAt.toISOString(), ACTOR);

    const after = (await fetchEmergencyProtocol("internet"))!.protocol;
    expect(after.steps.map((s) => [s.position, s.text, s.isCritical])).toEqual([
      [1, "Passo B", false],
      [2, "Passo A", true],
    ]);
    expect(after.notes).toBe("Roteador fica no escritório.");
    const entry = repository.auditEntries.at(-1)!;
    expect(entry.action).toBe("emergency_protocol_updated");
    expect((entry.beforeState as { steps: unknown[] }).steps).toHaveLength(before.steps.length);
  });

  it("contato prioritário inexistente é recusado", async () => {
    const protocol = (await fetchEmergencyProtocol("internet"))!.protocol;
    const input: EmergencyProtocolInput = {
      title: protocol.title,
      category: "servico_essencial",
      description: protocol.description,
      priority: protocol.priority,
      displayOrder: protocol.displayOrder,
      warning: null,
      potentialCoverageKeys: [],
      priorityContactId: "00000000-0000-0000-0000-00000000dead",
      notes: null,
      steps: [{ text: "Passo", isCritical: false }],
    };
    await expect(updateEmergencyProtocol(protocol.id, input, protocol.updatedAt.toISOString(), ACTOR)).rejects.toBeInstanceOf(EmergencyInvalidPriorityContactError);
  });

  it("dados administrativos incluem inativos e os passos de todos os protocolos, ordenados", async () => {
    const { contacts, protocols } = await fetchEmergencyAdminData();
    expect(contacts).toHaveLength(18);
    expect(protocols).toHaveLength(12);
    for (const protocol of protocols) {
      expect(protocol.steps.map((s) => s.position)).toEqual(protocol.steps.map((_, i) => i + 1));
    }
  });
});
