import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordInboundMessage, getLastInboundMessageAt, resolveAdminActorFromPhone, matchCustomerIdByPhone, matchAdminActorByPhone } from "@/lib/management/inboundMessages";
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

describe("resolveAdminActorFromPhone — allowlist preparada", () => {
  it("sem banco configurado neste ambiente -> null (nunca resolve um actor administrativo por omissão)", async () => {
    expect(await resolveAdminActorFromPhone("+5511999998888")).toBeNull();
  });

  it("Missão Z6.5 — whatsapp_admin_numbers nunca é populada por código de aplicação (só por script operacional avulso, fora do código versionado que roda em produção)", () => {
    const serviceSource = readFileSync(new URL("./inboundMessages.ts", import.meta.url), "utf-8");
    // Só a leitura (select/innerJoin) é esperada aqui — nenhuma linha de allowlist é inserida por este módulo.
    expect(serviceSource).not.toMatch(/insert\(whatsappAdminNumbers\)/);
  });
});

describe("matchAdminActorByPhone — Missão Z6.5 (número autorizado x não autorizado, sem banco)", () => {
  const candidates = [{ phoneE164: "+5548991741102", id: "user-1", name: "Robério", role: "admin" as const, businessTitle: "Proprietário/Administrador" }];

  it("teste obrigatório — número autorizado (na allowlist) é reconhecido como admin", () => {
    const result = matchAdminActorByPhone(candidates, "+5548991741102");
    expect(result).toEqual({ id: "user-1", name: "Robério", role: "admin", businessTitle: "Proprietário/Administrador" });
  });

  it("teste obrigatório — número não autorizado (fora da allowlist) é rejeitado como admin, devolve null", () => {
    expect(matchAdminActorByPhone(candidates, "+5511999998888")).toBeNull();
  });

  it("allowlist vazia -> sempre null, nunca reconhece ninguém por omissão", () => {
    expect(matchAdminActorByPhone([], "+5548991741102")).toBeNull();
  });

  it("teste obrigatório — reconhecimento é SÓ pelo telefone: a função nem recebe o texto da mensagem como parâmetro, então nenhuma declaração no texto ('sou admin', 'aprovo tudo') pode ter efeito algum", () => {
    // Prova estrutural: a assinatura de matchAdminActorByPhone/resolveWhatsAppAdminActor só aceita um telefone — não existe parâmetro de texto para influenciar o resultado.
    expect(matchAdminActorByPhone.length).toBe(2); // (candidates, phoneE164) — nenhum terceiro parâmetro de texto
    // Mesmo telefone AUTORIZADO, o resultado nunca muda em função de nenhum conteúdo externo — só existe UMA saída possível por telefone.
    const first = matchAdminActorByPhone(candidates, "+5548991741102");
    const second = matchAdminActorByPhone(candidates, "+5548991741102");
    expect(first).toEqual(second);
  });
});

/**
 * Achado real (Vinicius Anacleto, DDD 48) — a conta WhatsApp dele entrega o remetente sem o nono
 * dígito. `matchAdminActorByPhone` agora também reconhece a equivalência brasileira 8/9 dígitos
 * (`phone.ts#brazilianNineDigitEquivalent`), com trava de ambiguidade: nunca escolhe um usuário
 * arbitrariamente quando dois candidatos diferentes poderiam corresponder ao mesmo identificador.
 */
describe("matchAdminActorByPhone — equivalência brasileira do nono dígito", () => {
  const admin = { phoneE164: "+5521980746463", id: "admin-1", name: "Robério", role: "admin" as const, businessTitle: "Proprietário/Administrador" };
  const gerente = { phoneE164: "+5548998161302", id: "gerente-1", name: "Vinicius Anacleto", role: "operacional" as const, businessTitle: "Gerente" };

  it("meu número (admin, 9 dígitos) continua reconhecido exatamente como antes — o caminho de equivalência nem precisa ser exercitado", () => {
    const result = matchAdminActorByPhone([admin, gerente], "+5521980746463");
    expect(result).toEqual({ id: "admin-1", name: "Robério", role: "admin", businessTitle: "Proprietário/Administrador" });
  });

  it("Vinicius entregue pela Meta SEM o nono dígito (8 dígitos, formato real do incidente) é reconhecido via equivalência", () => {
    const result = matchAdminActorByPhone([admin, gerente], "+554898161302");
    expect(result).toEqual({ id: "gerente-1", name: "Vinicius Anacleto", role: "operacional", businessTitle: "Gerente" });
  });

  it("Vinicius continua 'operacional', nunca herda 'admin' por causa da equivalência", () => {
    const result = matchAdminActorByPhone([admin, gerente], "+554898161302");
    expect(result?.role).toBe("operacional");
  });

  it("número totalmente fora da allowlist (válido, brasileiro, não cadastrado) continua rejeitado mesmo considerando equivalência", () => {
    expect(matchAdminActorByPhone([admin, gerente], "+5511988887777")).toBeNull();
  });

  it("colisão ambígua entre dois candidatos diferentes -> null, NUNCA escolhe um deles arbitrariamente", () => {
    // Dois usuários diferentes cadastrados em formas equivalentes: um com 9 dígitos, outro já
    // com 8 — um número recebido de 8 dígitos bate exato num e, por equivalência, no outro.
    const candidatoA = { phoneE164: "+5548998161302", id: "user-A", name: "Fulano", role: "operacional" as const, businessTitle: null };
    const candidatoB = { phoneE164: "+554898161302", id: "user-B", name: "Beltrano", role: "operacional" as const, businessTitle: null };
    expect(matchAdminActorByPhone([candidatoA, candidatoB], "+554898161302")).toBeNull();
    // Mesmo o telefone de A (9 dígitos) sendo enviado diretamente, ainda colide via equivalência com B.
    expect(matchAdminActorByPhone([candidatoA, candidatoB], "+5548998161302")).toBeNull();
  });

  it("fixo de 8 dígitos cadastrado nunca é confundido com um celular equivalente de 9 dígitos", () => {
    const fixo = { phoneE164: "+551133334444", id: "fixo-1", name: "Recepção", role: "operacional" as const, businessTitle: null };
    expect(matchAdminActorByPhone([fixo], "+5511933334444")).toBeNull();
  });
});

describe("Missão Z6.5 — resolução de admin conectada ao orquestrador, mas sem acionar nada automaticamente", () => {
  it("orchestrator.ts está de fato conectado a resolveAdminActorFromPhone (conexão pedida pela missão)", () => {
    const orchestratorSource = readFileSync(new URL("../zezinho/generative/orchestrator.ts", import.meta.url), "utf-8");
    expect(orchestratorSource).toContain("resolveAdminActorFromPhone");
    expect(orchestratorSource).toContain("export async function resolveWhatsAppAdminActor");
  });

  it("resolveWhatsAppAdminActor em si nunca chama answerGenerative/ferramentas — só resolve identidade", () => {
    const orchestratorSource = readFileSync(new URL("../zezinho/generative/orchestrator.ts", import.meta.url), "utf-8");
    const match = orchestratorSource.match(/export async function resolveWhatsAppAdminActor[\s\S]*?\n}/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toContain("answerGenerative");
    expect(match![0]).not.toContain("buildZezinhoTools");
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

describe("Missão Z6.4 (seção 9) — nenhum caminho de auto-resposta a CLIENTES existe no recebimento", () => {
  it("inboundMessages.ts nunca importa/chama nenhuma função de envio real (sendApprovedOutboundMessage, whatsappCloudApiChannel)", () => {
    const serviceSource = readFileSync(new URL("./inboundMessages.ts", import.meta.url), "utf-8");
    // queueMessageForApproval é citado só em comentário como analogia de padrão de idempotência — não é um risco de auto-resposta (draft continua exigindo aprovação humana), por isso não entra nesta lista.
    for (const forbidden of ["sendApprovedOutboundMessage", "whatsappCloudApiChannel"]) {
      expect(serviceSource).not.toContain(forbidden);
    }
  });

  it("Missão Z6.6 — route.ts NUNCA toca o fluxo de aprovação gerenciado de outbound_messages (categoria C — mensagens a clientes continuam exigindo aprovação manual, trilha separada e intocada)", () => {
    const routeSource = readFileSync(new URL("../../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf-8");
    for (const forbidden of ["sendApprovedOutboundMessage", "whatsappCloudApiChannel", "queueMessageForApproval", "approveMessages", "assertMessageApproved"]) {
      expect(routeSource).not.toContain(forbidden);
    }
  });

  it("Missão Z6.6 — o disparo do fluxo conversacional em route.ts está estruturalmente condicionado a adminActor não-nulo (número fora da allowlist nunca aciona a conversa)", () => {
    const routeSource = readFileSync(new URL("../../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf-8");
    expect(routeSource).toMatch(/if\s*\(\s*adminActor\s*&&[^)]*\)\s*\{\s*\n\s*conversation\s*=\s*await\s*handleAdminConversationalMessage/);
  });
});
