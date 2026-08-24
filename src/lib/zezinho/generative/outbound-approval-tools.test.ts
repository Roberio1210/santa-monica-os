import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Missão "Regra Absoluta de Envio" — as 4 ferramentas de aprovação (queue/list/approve/discard),
 * mockando `@/lib/management/outboundMessages` (sem banco). Confirma o que é garantível no nível
 * de código: nenhuma ferramenta envia, aprovação nunca é genérica (exige ids específicos, nunca
 * "todas"), edição muda o texto final sem apagar o original, aprovação de um id nunca afeta
 * outro, e a identidade de quem decide vem sempre da sessão real (`actor`), nunca do texto do
 * chat. O comportamento do MODELO ao interpretar "está boa"/"gostei" como não-aprovação é regra
 * de prompt (ver systemPrompt.test.ts) — aqui travamos a garantia estrutural: sem `mensagem_ids`
 * explícitos não existe chamada possível de aprovação.
 */

const queueMessageForApprovalMock = vi.fn();
const listPendingApprovalsMock = vi.fn();
const approveMessagesMock = vi.fn();
const discardMessagesMock = vi.fn();

vi.mock("@/lib/management/outboundMessages", () => ({
  queueMessageForApproval: (...args: unknown[]) => queueMessageForApprovalMock(...args),
  listPendingApprovals: (...args: unknown[]) => listPendingApprovalsMock(...args),
  approveMessages: (...args: unknown[]) => approveMessagesMock(...args),
  discardMessages: (...args: unknown[]) => discardMessagesMock(...args),
}));

async function toolsFor(role: "admin" | "operacional", actor: { id: string; name: string } | null) {
  const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
  return buildZezinhoTools(role, actor);
}

describe("queue_message_for_approval — gera rascunho, nunca envia", () => {
  beforeEach(() => queueMessageForApprovalMock.mockReset());

  it("cria o rascunho com status 'rascunho' e devolve pré-visualização completa + aviso explícito", async () => {
    queueMessageForApprovalMock.mockResolvedValue({
      id: "msg-1", kind: "pos_venda", channel: "whatsapp", customerName: "João", vehicleModel: "Corolla", phoneMasked: "*******12",
      reason: "Lavação concluída hoje", draftText: "Oi João! Tudo bem?", finalText: null, status: "rascunho",
      approvedByName: null, approvedAt: null, discardedByName: null, discardedAt: null, sentAt: null, sendResult: null, createdAt: "2026-08-24T10:00:00.000Z",
    });
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.queue_message_for_approval!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ tipo: "pos_venda", cliente: "João", veiculo: "Corolla", telefone_mascarado: "*******12", motivo: "Lavação concluída hoje", texto: "Oi João! Tudo bem?" });
    expect(result.status).toBe("rascunho");
    expect(result.texto_completo).toBe("Oi João! Tudo bem?");
    expect(result.aviso).toMatch(/nenhuma mensagem foi enviada/i);
    expect(result.aviso).toMatch(/gostei.*está boa.*legal|está boa.*gostei/i);
  });

  it("Missão Z6.2 — repassa cliente_id quando fornecido (ex.: veio de inactive_customers), nunca obrigatório", async () => {
    queueMessageForApprovalMock.mockResolvedValue({
      id: "msg-2", kind: "reativacao", channel: "whatsapp", customerId: "cust-42", customerName: "Maria", vehicleModel: "HB20", phoneMasked: "*******34",
      reason: "Sumiu há 45 dias", draftText: "Oi Maria!", finalText: null, status: "rascunho",
      approvedByName: null, approvedAt: null, discardedByName: null, discardedAt: null, sentAt: null, sendResult: null, createdAt: "2026-08-24T10:00:00.000Z",
    });
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.queue_message_for_approval!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    await execute({ tipo: "reativacao", cliente: "Maria", cliente_id: "cust-42", veiculo: "HB20", telefone_mascarado: "*******34", motivo: "Sumiu há 45 dias", texto: "Oi Maria!" });
    expect(queueMessageForApprovalMock).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust-42" }));
  });

  it("Missão Z6.2 — sem cliente_id (ex.: veio de post_sale_candidates) -> customerId null, nunca inventado", async () => {
    queueMessageForApprovalMock.mockResolvedValue({
      id: "msg-3", kind: "pos_venda", channel: "whatsapp", customerId: null, customerName: "Pedro", vehicleModel: "Gol", phoneMasked: "*******56",
      reason: "Lavação concluída hoje", draftText: "Oi Pedro!", finalText: null, status: "rascunho",
      approvedByName: null, approvedAt: null, discardedByName: null, discardedAt: null, sentAt: null, sendResult: null, createdAt: "2026-08-24T10:00:00.000Z",
    });
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.queue_message_for_approval!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    await execute({ tipo: "pos_venda", cliente: "Pedro", veiculo: "Gol", telefone_mascarado: "*******56", motivo: "Lavação concluída hoje", texto: "Oi Pedro!" });
    expect(queueMessageForApprovalMock).toHaveBeenCalledWith(expect.objectContaining({ customerId: null }));
  });
});

describe("list_pending_approvals — pré-visualização obrigatória + contagem antes de decidir em lote", () => {
  beforeEach(() => listPendingApprovalsMock.mockReset());

  it("mostra a quantidade total antes de perguntar sobre aprovação em lote", async () => {
    listPendingApprovalsMock.mockResolvedValue([
      { id: "m1", kind: "pos_venda", channel: "whatsapp", customerName: "A", vehicleModel: "Onix", phoneMasked: "*******01", reason: "r1", draftText: "t1", finalText: null, status: "rascunho", approvedByName: null, approvedAt: null, discardedByName: null, discardedAt: null, sentAt: null, sendResult: null, createdAt: "x" },
      { id: "m2", kind: "reativacao", channel: "whatsapp", customerName: "B", vehicleModel: "HB20", phoneMasked: "*******02", reason: "r2", draftText: "t2", finalText: null, status: "rascunho", approvedByName: null, approvedAt: null, discardedByName: null, discardedAt: null, sentAt: null, sendResult: null, createdAt: "x" },
    ]);
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.list_pending_approvals!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});
    expect(result.total_pendente).toBe(2);
    expect(result.aviso).toMatch(/2 mensagem/);
    expect((result.mensagens as unknown[]).length).toBe(2);
  });

  it("lista vazia -> aviso null, nunca um texto de contagem sem sentido", async () => {
    listPendingApprovalsMock.mockResolvedValue([]);
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.list_pending_approvals!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});
    expect(result.total_pendente).toBe(0);
    expect(result.aviso).toBeNull();
  });
});

describe("approve_messages — aprovação SEMPRE específica, nunca genérica", () => {
  beforeEach(() => approveMessagesMock.mockReset());

  it("aprova só os ids pedidos; edição muda o texto final sem tocar no original (verificado no serviço, aqui confirma o repasse)", async () => {
    approveMessagesMock.mockResolvedValue({
      succeeded: [{ id: "m1", customerName: "João", finalText: "texto editado", approvedByName: "Robério" }],
      notFound: [],
      alreadyDecided: [],
    });
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.approve_messages!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ mensagem_ids: ["m1"], edicoes: [{ mensagem_id: "m1", texto_editado: "texto editado" }] });
    expect(approveMessagesMock).toHaveBeenCalledWith(["m1"], { id: "u1", name: "Robério" }, { m1: "texto editado" });
    expect((result.aprovadas as Array<Record<string, unknown>>)[0].texto_final).toBe("texto editado");
    expect(result.aviso).toMatch(/aprovado não significa enviado/i);
  });

  it("aprovação de um id (João) nunca aparece como aprovação de outro (Maria) — repassa exatamente o resultado do serviço", async () => {
    approveMessagesMock.mockResolvedValue({ succeeded: [{ id: "joao-id", customerName: "João", finalText: "oi joão", approvedByName: "Robério" }], notFound: [], alreadyDecided: [] });
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.approve_messages!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ mensagem_ids: ["joao-id"] });
    const aprovadas = result.aprovadas as Array<Record<string, unknown>>;
    expect(aprovadas).toHaveLength(1);
    expect(aprovadas[0].cliente).toBe("João");
    expect(aprovadas.some((a) => a.cliente === "Maria")).toBe(false);
  });

  it("sem sessão autenticada real (actor null) -> recusa aprovar, nunca aceita identidade do texto do chat", async () => {
    const tools = await toolsFor("admin", null);
    const execute = tools.approve_messages!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ mensagem_ids: ["m1"] });
    expect(result.aprovadas).toEqual([]);
    expect(approveMessagesMock).not.toHaveBeenCalled();
    expect(result.aviso).toMatch(/sessão autenticada/i);
  });

  it("ferramenta exige mensagem_ids não-vazio no schema — estruturalmente impossível 'aprovar tudo' sem listar (nunca aprovação implícita)", async () => {
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const schema = tools.approve_messages!.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({}).success).toBe(false); // sem mensagem_ids nenhuma
    expect(schema.safeParse({ mensagem_ids: [] }).success).toBe(false); // array vazio — "aprovar nada" explicitamente, nunca "aprovar tudo" implicitamente
    expect(schema.safeParse({ mensagem_ids: ["m1"] }).success).toBe(true);
  });
});

describe("discard_messages — nunca aprova, nunca envia; cliente descartado não recebe", () => {
  beforeEach(() => discardMessagesMock.mockReset());

  it("descarta só os ids pedidos", async () => {
    discardMessagesMock.mockResolvedValue({ succeeded: [{ id: "m1", customerName: "Cliente Descartado" }], notFound: [], alreadyDecided: [] });
    const tools = await toolsFor("admin", { id: "u1", name: "Robério" });
    const execute = tools.discard_messages!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ mensagem_ids: ["m1"] });
    expect((result.descartadas as unknown[]).length).toBe(1);
  });

  it("sem sessão autenticada real -> recusa descartar também", async () => {
    const tools = await toolsFor("admin", null);
    const execute = tools.discard_messages!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ mensagem_ids: ["m1"] });
    expect(result.descartadas).toEqual([]);
    expect(discardMessagesMock).not.toHaveBeenCalled();
  });
});

describe("Disponibilidade por papel — pós-venda/reativação continuam seguras para operacional (nunca dado financeiro)", () => {
  it("as 4 ferramentas de aprovação existem para admin e operacional", async () => {
    const admin = await toolsFor("admin", { id: "u1", name: "Robério" });
    const operacional = await toolsFor("operacional", { id: "u2", name: "Vinicius" });
    for (const id of ["queue_message_for_approval", "list_pending_approvals", "approve_messages", "discard_messages"]) {
      expect(admin).toHaveProperty(id);
      expect(operacional).toHaveProperty(id);
    }
  });
});
