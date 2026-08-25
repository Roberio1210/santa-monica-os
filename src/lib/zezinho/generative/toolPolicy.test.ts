import { describe, expect, it } from "vitest";
import { applyToolPolicy } from "@/lib/zezinho/generative/toolPolicy";
import type { ToolSet } from "ai";

/** Missão Z6.6 (teste obrigatório 6) — ferramenta com efeito colateral continua bloqueada na política conversacional. */

function fakeTools(names: string[]): ToolSet {
  const tools: Record<string, unknown> = {};
  for (const name of names) tools[name] = { description: name, inputSchema: {}, execute: async () => ({}) };
  return tools as ToolSet;
}

describe("applyToolPolicy", () => {
  const allTools = fakeTools(["inventory_lookup", "crm_lookup", "daily_management_summary", "queue_message_for_approval", "approve_messages", "discard_messages"]);

  it('"full" devolve exatamente o mesmo conjunto, sem filtrar nada (comportamento padrão, sessão Web inalterada)', () => {
    expect(applyToolPolicy(allTools, "full")).toBe(allTools);
  });

  it('"conversational_read_only" remove as 3 ferramentas com efeito colateral', () => {
    const filtered = applyToolPolicy(allTools, "conversational_read_only");
    expect(filtered).not.toHaveProperty("queue_message_for_approval");
    expect(filtered).not.toHaveProperty("approve_messages");
    expect(filtered).not.toHaveProperty("discard_messages");
  });

  it('"conversational_read_only" preserva todas as ferramentas de leitura', () => {
    const filtered = applyToolPolicy(allTools, "conversational_read_only");
    expect(filtered).toHaveProperty("inventory_lookup");
    expect(filtered).toHaveProperty("crm_lookup");
    expect(filtered).toHaveProperty("daily_management_summary");
  });

  it("nunca lança para um conjunto vazio", () => {
    expect(applyToolPolicy({}, "conversational_read_only")).toEqual({});
  });
});
