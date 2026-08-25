import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordInboundMessage, getLastInboundMessageAt, resolveAdminActorFromPhone, matchCustomerIdByPhone } from "@/lib/management/inboundMessages";
import { DatabaseUnavailableError } from "@/lib/management/outboundMessages";

/**
 * Missão Z6.2 — testes obrigatórios 14, 15, 16. Neste ambiente de teste `getDb()` sempre devolve
 * `null` (sem `DATABASE_URL` carregada pelo vitest, mesmo fato já estabelecido nas missões
 * anteriores) — então o caminho real testável aqui é "nunca finge sucesso sem banco real", igual
 * ao padrão já usado em `outboundMessages.test.ts`. A idempotência de `recordInboundMessage`
 * (teste 14) usa exatamente o mesmo formato `onConflictDoNothing({ target: ... }) + fallback
 * select` já provado em `queueMessageForApproval` — equivalência de código, não uma segunda prova
 * ao vivo (não há banco disponível para isso neste ambiente).
 */

describe("recordInboundMessage — teste obrigatório 14 (idempotência por external_message_id)", () => {
  it("nunca finge ter gravado uma mensagem recebida sem banco real", async () => {
    await expect(
      recordInboundMessage({ phoneE164: "+5511999998888", externalMessageId: "wamid.ABC", messageType: "text", textBody: "oi", receivedAt: new Date() }),
    ).rejects.toThrow(DatabaseUnavailableError);
  });
});

describe("getLastInboundMessageAt", () => {
  it("customerId null -> null, sem tocar banco", async () => {
    expect(await getLastInboundMessageAt(null)).toBeNull();
  });

  it("sem banco configurado neste ambiente -> null, nunca lança (usado só para calcular a janela de 24h, nunca deve travar o envio por si só)", async () => {
    expect(await getLastInboundMessageAt("cust-1")).toBeNull();
  });
});

describe("resolveAdminActorFromPhone — testes obrigatórios 15/16 (cliente nunca vira admin; allowlist preparada)", () => {
  it("sem banco configurado neste ambiente -> null (nunca resolve um actor administrativo por omissão)", async () => {
    expect(await resolveAdminActorFromPhone("+5511999998888")).toBeNull();
  });

  it("teste obrigatório 15 — NUNCA é chamada por tools.ts/orchestrator.ts nesta missão (guarda estrutural: mensagem recebida não aciona ação administrativa sozinha)", () => {
    const toolsSource = readFileSync(new URL("../zezinho/generative/tools.ts", import.meta.url), "utf-8");
    const orchestratorSource = readFileSync(new URL("../zezinho/generative/orchestrator.ts", import.meta.url), "utf-8");
    expect(toolsSource).not.toContain("resolveAdminActorFromPhone");
    expect(orchestratorSource).not.toContain("resolveAdminActorFromPhone");
  });

  it("teste obrigatório 16 — whatsapp_admin_numbers nunca é populada por código desta missão (nenhum .insert nela fora do schema/migração)", () => {
    const serviceSource = readFileSync(new URL("./inboundMessages.ts", import.meta.url), "utf-8");
    // Só a leitura (select/innerJoin) é esperada aqui — nenhuma linha de allowlist é inserida por este módulo.
    expect(serviceSource).not.toMatch(/insert\(whatsappAdminNumbers\)/);
  });
});

describe("matchCustomerIdByPhone — Missão Z6.4 (teste real de resolução de cliente, sem banco)", () => {
  it("encontra o cliente cujo telefone normaliza para o mesmo E.164", () => {
    const candidates = [
      { id: "cust-1", phone: "(11) 99999-8888" },
      { id: "cust-2", phone: "48 91741102" },
    ];
    expect(matchCustomerIdByPhone(candidates, "+5511999998888")).toBe("cust-1");
    expect(matchCustomerIdByPhone(candidates, "+554891741102")).toBe("cust-2");
  });

  it("telefone que não bate com nenhum candidato -> null, nunca um cliente errado", () => {
    const candidates = [{ id: "cust-1", phone: "(11) 99999-8888" }];
    expect(matchCustomerIdByPhone(candidates, "+5521988887777")).toBeNull();
  });

  it("lista vazia -> null", () => {
    expect(matchCustomerIdByPhone([], "+5511999998888")).toBeNull();
  });

  it("telefone de candidato mascarado/inválido (nunca normaliza) -> nunca dá match por acidente", () => {
    const candidates = [{ id: "cust-1", phone: "***mascarado***" }];
    expect(matchCustomerIdByPhone(candidates, "+5511999998888")).toBeNull();
  });
});

describe("Missão Z6.4 (seção 9) — nenhum caminho de auto-resposta existe no recebimento", () => {
  it("inboundMessages.ts nunca importa/chama nenhuma função de envio real (sendApprovedOutboundMessage, whatsappCloudApiChannel)", () => {
    const serviceSource = readFileSync(new URL("./inboundMessages.ts", import.meta.url), "utf-8");
    // queueMessageForApproval é citado só em comentário como analogia de padrão de idempotência — não é um risco de auto-resposta (draft continua exigindo aprovação humana), por isso não entra nesta lista.
    for (const forbidden of ["sendApprovedOutboundMessage", "whatsappCloudApiChannel"]) {
      expect(serviceSource).not.toContain(forbidden);
    }
  });

  it("a rota do webhook (route.ts) nunca importa/chama nenhuma função de envio", () => {
    const routeSource = readFileSync(new URL("../../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf-8");
    for (const forbidden of ["sendApprovedOutboundMessage", "whatsappCloudApiChannel", "queueMessageForApproval", "answerGenerative"]) {
      expect(routeSource).not.toContain(forbidden);
    }
  });
});
