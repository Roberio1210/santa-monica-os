import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/emergency/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/emergency/service")>();
  return {
    ...actual,
    createEmergencyContact: vi.fn(),
    updateEmergencyContact: vi.fn(),
    setEmergencyContactActive: vi.fn(),
    updateEmergencyProtocol: vi.fn(),
    setEmergencyProtocolActive: vi.fn(),
  };
});

import { createContactAction, toggleContactActiveAction, toggleProtocolActiveAction, updateContactAction, updateProtocolAction } from "@/app/configuracoes/emergencia/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { EmergencyConcurrentUpdateError } from "@/lib/emergency/repository";
import { createEmergencyContact, setEmergencyContactActive, setEmergencyProtocolActive, updateEmergencyContact, updateEmergencyProtocol } from "@/lib/emergency/service";

/**
 * Módulo Emergência (Fase 1) — a administração é FAIL-CLOSED no servidor: sem sessão (estado
 * atual com INDIVIDUAL_AUTH_ENABLED desligado) ou com papel operacional, nenhuma action chega a
 * chamar o serviço — mesmo chamada diretamente, sem passar pela tela.
 */

const ADMIN = { id: "00000000-0000-0000-0000-0000000000aa", email: "admin@example.com", name: "Admin Teste", role: "admin" as const };
const OPERACIONAL = { id: "00000000-0000-0000-0000-0000000000bb", email: "op@example.com", name: "Operacional Teste", role: "operacional" as const };
const INITIAL = { error: null, success: null };

function formData(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

const CONTACT_FIELDS = { name: "Celesc", category: "concessionaria", phone: "", phoneAlt: "", whatsapp: "", email: "", website: "", priority: "normal", displayOrder: "90", notes: "" };
const PROTOCOL_FIELDS = {
  id: "11111111-1111-1111-1111-111111111111",
  expectedUpdatedAt: "2026-10-04T12:00:00.000Z",
  title: "Internet",
  category: "servico_essencial",
  description: "Internet fora do ar.",
  priority: "normal",
  displayOrder: "80",
  warning: "",
  notes: "",
  priorityContactId: "",
  potentialCoverageKeys: [] as string[],
  steps: "Verifique o roteador\n! Afaste-se de fios expostos",
};

const ALL_ACTIONS = [
  ["createContactAction", () => createContactAction(INITIAL, formData(CONTACT_FIELDS))],
  ["updateContactAction", () => updateContactAction(INITIAL, formData({ ...CONTACT_FIELDS, id: "x", expectedUpdatedAt: "2026-10-04T12:00:00.000Z" }))],
  ["toggleContactActiveAction", () => toggleContactActiveAction(INITIAL, formData({ id: "x", expectedUpdatedAt: "2026-10-04T12:00:00.000Z", active: "false" }))],
  ["updateProtocolAction", () => updateProtocolAction(INITIAL, formData(PROTOCOL_FIELDS))],
  ["toggleProtocolActiveAction", () => toggleProtocolActiveAction(INITIAL, formData({ id: "x", expectedUpdatedAt: "2026-10-04T12:00:00.000Z", active: "false" }))],
] as const;

const SERVICE_MOCKS = [createEmergencyContact, updateEmergencyContact, setEmergencyContactActive, updateEmergencyProtocol, setEmergencyProtocolActive];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("administração da Central — fail-closed", () => {
  it.each(ALL_ACTIONS)("%s: sem sessão -> negado, serviço nunca chamado", async (_name, run) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const result = await run();
    expect(result.error).toMatch(/Não autorizado/);
    for (const mock of SERVICE_MOCKS) expect(mock).not.toHaveBeenCalled();
  });

  it.each(ALL_ACTIONS)("%s: papel operacional -> negado, serviço nunca chamado", async (_name, run) => {
    vi.mocked(getCurrentUser).mockResolvedValue(OPERACIONAL);
    const result = await run();
    expect(result.error).toBe("Acesso restrito a administradores.");
    for (const mock of SERVICE_MOCKS) expect(mock).not.toHaveBeenCalled();
  });
});

describe("administração da Central — admin", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
  });

  it("cria contato com o id do admin como autor da auditoria", async () => {
    const result = await createContactAction(INITIAL, formData(CONTACT_FIELDS));
    expect(result).toEqual({ error: null, success: "Contato criado." });
    expect(createEmergencyContact).toHaveBeenCalledWith(expect.objectContaining({ name: "Celesc", phone: null }), ADMIN.id);
  });

  it("dado inválido é recusado antes de chegar ao serviço", async () => {
    const result = await createContactAction(INITIAL, formData({ ...CONTACT_FIELDS, phone: "abc" }));
    expect(result.error).toBe("Telefone inválido.");
    expect(createEmergencyContact).not.toHaveBeenCalled();
  });

  it("campos fora da lista esperada nunca chegam ao serviço (sem mass assignment)", async () => {
    await createContactAction(INITIAL, formData({ ...CONTACT_FIELDS, active: "false", key: "invasor", id: "x" }));
    const input = vi.mocked(createEmergencyContact).mock.calls[0][0];
    expect(Object.keys(input).sort()).toEqual(["category", "displayOrder", "email", "name", "notes", "phone", "phoneAlt", "priority", "website", "whatsapp"]);
  });

  it("edição de protocolo envia passos ordenados e a versão esperada", async () => {
    const result = await updateProtocolAction(INITIAL, formData(PROTOCOL_FIELDS));
    expect(result.success).toBe("Protocolo atualizado.");
    expect(updateEmergencyProtocol).toHaveBeenCalledWith(
      PROTOCOL_FIELDS.id,
      expect.objectContaining({
        steps: [
          { text: "Verifique o roteador", isCritical: false },
          { text: "Afaste-se de fios expostos", isCritical: true },
        ],
      }),
      PROTOCOL_FIELDS.expectedUpdatedAt,
      ADMIN.id,
    );
  });

  it("conflito de concorrência vira mensagem clara, sem sobrescrever", async () => {
    vi.mocked(updateEmergencyContact).mockRejectedValue(new EmergencyConcurrentUpdateError());
    const result = await updateContactAction(INITIAL, formData({ ...CONTACT_FIELDS, id: "x", expectedUpdatedAt: "2026-10-04T12:00:00.000Z" }));
    expect(result.error).toMatch(/alterado por outra pessoa/);
  });

  it("requisição sem id/versão é recusada", async () => {
    const result = await toggleContactActiveAction(INITIAL, formData({ active: "false" }));
    expect(result.error).toBe("Requisição inválida.");
    expect(setEmergencyContactActive).not.toHaveBeenCalled();
  });
});
