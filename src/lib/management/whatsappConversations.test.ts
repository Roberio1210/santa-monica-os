import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeConversationHistory, getConversationHistory, findExistingReplyForInbound, recordOutboundReply, updateOutboundReplyStatus, recordDeliveryStatusUpdate, isKnownDeliveryStatus } from "@/lib/management/whatsappConversations";
import { DatabaseUnavailableError } from "@/lib/management/outboundMessages";

/**
 * Missão Z6.6 (testes obrigatórios 7, 12, 13). Neste ambiente de teste `getDb()` sempre devolve
 * `null` — mesmo fato já estabelecido em toda a engenharia deste projeto — então as funções de
 * I/O são testadas pelo caminho real "nunca finge sucesso sem banco", e a lógica de mesclagem de
 * histórico é testada diretamente via `mergeConversationHistory` (pura).
 */

describe("mergeConversationHistory — testes obrigatórios 12/13 (continuidade e isolamento de conversa)", () => {
  it("teste obrigatório 12 — mescla turnos de usuário e assistente em ordem cronológica (contexto mantido entre mensagens consecutivas)", () => {
    const inbound = [{ content: "qual vitrificação você recomenda para um carro zero?", createdAt: new Date("2026-08-25T10:00:00.000Z") }];
    const outbound = [{ content: "Recomendo a Vitrificação Premium para carros zero km.", createdAt: new Date("2026-08-25T10:00:05.000Z") }];
    const inbound2 = [...inbound, { content: "e se ele ficar muito no sol?", createdAt: new Date("2026-08-25T10:01:00.000Z") }];

    const history = mergeConversationHistory(inbound2, outbound);
    expect(history).toEqual([
      { role: "user", content: "qual vitrificação você recomenda para um carro zero?" },
      { role: "assistant", content: "Recomendo a Vitrificação Premium para carros zero km." },
      { role: "user", content: "e se ele ficar muito no sol?" },
    ]);
  });

  it("respeita o limite (últimas N mensagens), nunca envia histórico ilimitado", () => {
    const inbound = Array.from({ length: 20 }, (_, i) => ({ content: `mensagem ${i}`, createdAt: new Date(2026, 7, 25, 10, 0, i) }));
    const history = mergeConversationHistory(inbound, [], 5);
    expect(history).toHaveLength(5);
    expect(history[4].content).toBe("mensagem 19");
  });

  it("mensagens inbound sem texto (content null, ex.: tipo não suportado) são ignoradas, nunca viram um turno vazio", () => {
    const inbound = [
      { content: "oi", createdAt: new Date("2026-08-25T10:00:00.000Z") },
      { content: null, createdAt: new Date("2026-08-25T10:00:05.000Z") },
    ];
    const history = mergeConversationHistory(inbound, []);
    expect(history).toEqual([{ role: "user", content: "oi" }]);
  });

  it("sem histórico nenhum -> array vazio", () => {
    expect(mergeConversationHistory([], [])).toEqual([]);
  });

  it("teste obrigatório 13 — isolamento é estrutural: passar só os turnos de um telefone nunca inclui conteúdo de outro (a função nunca recebe dado de mais de um telefone ao mesmo tempo)", () => {
    // Simula duas conversas completamente separadas — cada chamada só enxerga os dados do seu próprio telefone.
    const conversaAdmin = mergeConversationHistory([{ content: "Zezinho, como foi o dia?", createdAt: new Date("2026-08-25T10:00:00.000Z") }], []);
    const conversaOutroNumero = mergeConversationHistory([{ content: "mensagem de outro remetente", createdAt: new Date("2026-08-25T10:00:00.000Z") }], []);
    expect(conversaAdmin.some((m) => m.content.includes("outro remetente"))).toBe(false);
    expect(conversaOutroNumero.some((m) => m.content.includes("como foi o dia"))).toBe(false);
  });

  it("teste obrigatório 13 — getConversationHistory sempre filtra por phoneE164 nas duas fontes (inbound_messages e whatsapp_outbound_replies), nunca uma consulta global", () => {
    const source = readFileSync(new URL("./whatsappConversations.ts", import.meta.url), "utf-8");
    const functionBody = source.slice(source.indexOf("export async function getConversationHistory"), source.indexOf("export interface OutboundReplyRecord"));
    const phoneFilterCount = (functionBody.match(/eq\([a-zA-Z.]+\.phoneE164, phoneE164\)/g) ?? []).length;
    expect(phoneFilterCount).toBe(2); // uma vez para inbound_messages, uma vez para whatsapp_outbound_replies
  });
});

describe("getConversationHistory / findExistingReplyForInbound / recordOutboundReply / updateOutboundReplyStatus — sem banco neste ambiente", () => {
  it("getConversationHistory sem banco -> [] (nunca lança, conversa começa vazia)", async () => {
    expect(await getConversationHistory("+5548991741102")).toEqual([]);
  });

  it("findExistingReplyForInbound sem banco -> null", async () => {
    expect(await findExistingReplyForInbound("wamid.ABC")).toBeNull();
  });

  it("teste obrigatório 7 — recordOutboundReply nunca finge ter criado uma resposta sem banco real", async () => {
    await expect(recordOutboundReply({ phoneE164: "+5548991741102", content: "oi", triggeredByExternalMessageId: "wamid.ABC" })).rejects.toThrow(DatabaseUnavailableError);
  });

  it("updateOutboundReplyStatus nunca finge sucesso sem banco real", async () => {
    await expect(updateOutboundReplyStatus("id-1", { status: "accepted", sendResult: "ok" })).rejects.toThrow(DatabaseUnavailableError);
  });

  it("teste obrigatório (wamid desconhecido) — recordDeliveryStatusUpdate sem banco -> correlationFound:false, nunca lança", async () => {
    const result = await recordDeliveryStatusUpdate({ wamid: "wamid.QUALQUER", status: "delivered" });
    expect(result).toEqual({ correlationFound: false, outboundReplyId: null });
  });
});

describe("isKnownDeliveryStatus — Missão Z6.7 (só os 4 valores documentados pela Meta)", () => {
  it("sent/delivered/read/failed são reconhecidos", () => {
    expect(isKnownDeliveryStatus("sent")).toBe(true);
    expect(isKnownDeliveryStatus("delivered")).toBe(true);
    expect(isKnownDeliveryStatus("read")).toBe(true);
    expect(isKnownDeliveryStatus("failed")).toBe(true);
  });

  it("qualquer outro valor -> false, nunca aceito por engano (nunca gravado num enum estrito)", () => {
    expect(isKnownDeliveryStatus("enviando")).toBe(false);
    expect(isKnownDeliveryStatus("")).toBe(false);
    expect(isKnownDeliveryStatus("SENT")).toBe(false); // case-sensitive, igual ao vocabulário exato da Meta
  });
});
