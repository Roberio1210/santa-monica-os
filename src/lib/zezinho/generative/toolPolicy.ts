import type { ToolSet } from "ai";

/**
 * Missão Z6.6 — camada de policy/tool gating, reutilizável e testável, sem duplicar o
 * orquestrador. Auditoria completa de `tools.ts` (todas as três funções que compõem
 * `buildZezinhoTools`): as ÚNICAS ferramentas com efeito colateral real (escrita) em todo o
 * catálogo do Zézinho são estas três — todo o resto (`buildRegistryTools`, sempre roteado pelo
 * dispatcher determinístico da Z1; `buildLookupTools`; as demais de `buildKnowledgeTools`) é
 * consulta pura, nunca grava nada.
 *
 * "conversational_read_only" existe para o canal de conversa do WhatsApp administrativo (Missão
 * Z6.6): o gestor pode conversar livremente, mas nenhuma ação/ferramenta com efeito colateral é
 * exposta ao modelo nessa política — a distinção conceitual A) conversa x B) ação com efeito
 * colateral (seção 7 da missão) é imposta AQUI, estruturalmente, antes do modelo sequer saber que
 * essas ferramentas existem (mesma defesa em profundidade já usada pelo RBAC de papel).
 */
const SIDE_EFFECT_TOOL_NAMES = new Set(["queue_message_for_approval", "approve_messages", "discard_messages"]);

export type ToolPolicy = "full" | "conversational_read_only";

export function applyToolPolicy(tools: ToolSet, policy: ToolPolicy): ToolSet {
  if (policy === "full") return tools;

  const filtered: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    if (SIDE_EFFECT_TOOL_NAMES.has(name)) continue;
    filtered[name] = definition;
  }
  return filtered;
}
