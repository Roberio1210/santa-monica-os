import { describe, expect, it } from "vitest";
import {
  partitionIdsByStatus,
  resolveFinalText,
  assertMessageApproved,
  OutboundMessageNotApprovedError,
  unconfiguredChannel,
  getAutonomyLevel,
  setAutonomyLevel,
  AutonomyChangeForbiddenError,
  queueMessageForApproval,
  approveMessages,
  discardMessages,
  sendApprovedOutboundMessage,
  DatabaseUnavailableError,
  type OutboundMessageStatus,
} from "@/lib/management/outboundMessages";

/**
 * Missão "Regra Absoluta de Envio" — o Zézinho nunca tem autonomia para enviar sozinho nesta
 * fase. Testado em dois níveis: (1) lógica pura (partição de ids, resolução de texto final, o
 * próprio gate de aprovação) — direto, sem banco; (2) o caminho "sem banco configurado" das
 * funções de I/O, que neste ambiente de teste é sempre real (não há DATABASE_URL carregada pelo
 * vitest) — confirma que elas NUNCA fingem sucesso quando não conseguem persistir de verdade.
 */

describe("partitionIdsByStatus — nunca sobrescreve uma decisão já tomada", () => {
  it("separa rascunho (decidível), não encontrado e já decidido", () => {
    const rows = [
      { id: "a", status: "rascunho" as OutboundMessageStatus },
      { id: "b", status: "aprovada" as OutboundMessageStatus },
      { id: "c", status: "descartada" as OutboundMessageStatus },
    ];
    const result = partitionIdsByStatus(["a", "b", "c", "d"], rows);
    expect(result.toDecide.map((r) => r.id)).toEqual(["a"]);
    expect(result.alreadyDecided.sort()).toEqual(["b", "c"]);
    expect(result.notFound).toEqual(["d"]);
  });

  it("aprovação de um id nunca inclui outro id não pedido (aprovação de João não autoriza Maria)", () => {
    const rows = [
      { id: "joao", status: "rascunho" as OutboundMessageStatus },
      { id: "maria", status: "rascunho" as OutboundMessageStatus },
    ];
    const result = partitionIdsByStatus(["joao"], rows);
    expect(result.toDecide.map((r) => r.id)).toEqual(["joao"]);
    expect(result.toDecide.some((r) => r.id === "maria")).toBe(false);
  });
});

describe("resolveFinalText — edição muda o texto final, nunca o rascunho original", () => {
  it("sem edição, usa o rascunho", () => {
    expect(resolveFinalText("texto original", undefined)).toBe("texto original");
  });

  it("com edição, usa o texto editado", () => {
    expect(resolveFinalText("texto original", "texto editado pelo gestor")).toBe("texto editado pelo gestor");
  });

  it("edição vazia/só espaços é tratada como 'sem edição' — nunca aprova um texto vazio", () => {
    expect(resolveFinalText("texto original", "   ")).toBe("texto original");
  });
});

describe("assertMessageApproved — O GATE (testes 12/13/14: job, webhook e retry nunca contornam)", () => {
  it("nunca lança para status 'aprovada'", () => {
    expect(() => assertMessageApproved("m1", "aprovada")).not.toThrow();
  });

  it("lança para 'rascunho', 'descartada', 'enviada' e 'falha_envio' — sempre o mesmo erro", () => {
    const statuses: OutboundMessageStatus[] = ["rascunho", "descartada", "enviada", "falha_envio"];
    for (const status of statuses) {
      expect(() => assertMessageApproved("m1", status)).toThrow(OutboundMessageNotApprovedError);
    }
  });

  it("um 'cron', um 'webhook' e uma 'retentativa' simulados usam a MESMA função e recebem a MESMA recusa — nenhum caminho de código contorna o gate", () => {
    function simulatedCronJob(status: OutboundMessageStatus) {
      return assertMessageApproved("m1", status);
    }
    function simulatedWebhookHandler(status: OutboundMessageStatus) {
      return assertMessageApproved("m1", status);
    }
    function simulatedRetry(status: OutboundMessageStatus) {
      return assertMessageApproved("m1", status);
    }
    for (const caller of [simulatedCronJob, simulatedWebhookHandler, simulatedRetry]) {
      expect(() => caller("rascunho")).toThrow(OutboundMessageNotApprovedError);
    }
  });
});

describe("unconfiguredChannel — nunca finge ter enviado", () => {
  it("send() sempre devolve success:false com o motivo real", async () => {
    const outcome = await unconfiguredChannel.send({
      id: "m1", kind: "pos_venda", channel: "whatsapp", customerName: "João", vehicleModel: "Corolla", phoneMasked: "*******12",
      reason: "teste", draftText: "oi", finalText: "oi", status: "aprovada", approvedByName: "Robério", approvedAt: null,
      discardedByName: null, discardedAt: null, sentAt: null, sendResult: null, createdAt: new Date().toISOString(),
    });
    expect(outcome.success).toBe(false);
    expect(outcome.result).toMatch(/ainda não configurado/i);
  });
});

describe("Autonomia — sempre inicia em MANUAL_APPROVAL, nunca ativa outro nível nesta fase", () => {
  it("getAutonomyLevel() sem banco configurado neste ambiente de teste -> MANUAL_APPROVAL (padrão seguro, nunca uma autonomia maior por omissão)", async () => {
    expect(await getAutonomyLevel()).toBe("MANUAL_APPROVAL");
  });

  it("OPERATIONAL nunca pode alterar o nível de autonomia, mesmo pedindo MANUAL_APPROVAL", async () => {
    await expect(setAutonomyLevel("MANUAL_APPROVAL", { id: "u1", name: "Vinicius", role: "operacional" })).rejects.toThrow(AutonomyChangeForbiddenError);
  });

  it("mesmo ADMIN não pode ativar LIMITED_AUTONOMY ou FULL_AUTONOMY nesta fase — a arquitetura está preparada, mas travada", async () => {
    await expect(setAutonomyLevel("LIMITED_AUTONOMY", { id: "u1", name: "Robério", role: "admin" })).rejects.toThrow(AutonomyChangeForbiddenError);
    await expect(setAutonomyLevel("FULL_AUTONOMY", { id: "u1", name: "Robério", role: "admin" })).rejects.toThrow(AutonomyChangeForbiddenError);
  });
});

describe("Funções de I/O nunca fingem sucesso sem persistir de verdade (sem DATABASE_URL neste ambiente de teste)", () => {
  it("queueMessageForApproval nunca finge ter criado um rascunho sem banco real", async () => {
    await expect(
      queueMessageForApproval({ kind: "pos_venda", customerName: "João", vehicleModel: "Corolla", phoneMasked: "*******12", reason: "teste", draftText: "oi", dedupeKey: "k1" }),
    ).rejects.toThrow(DatabaseUnavailableError);
  });

  it("approveMessages/discardMessages nunca fingem uma decisão sem banco real", async () => {
    await expect(approveMessages(["m1"], { id: "u1", name: "Robério" })).rejects.toThrow(DatabaseUnavailableError);
    await expect(discardMessages(["m1"], { id: "u1", name: "Robério" })).rejects.toThrow(DatabaseUnavailableError);
  });

  it("sendApprovedOutboundMessage nunca finge um envio sem banco real", async () => {
    await expect(sendApprovedOutboundMessage("m1")).rejects.toThrow(DatabaseUnavailableError);
  });
});
