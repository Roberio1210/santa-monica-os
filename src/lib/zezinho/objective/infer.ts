import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { ZezinhoIntent } from "@/lib/zezinho/intent/types";
import { OBJECTIVE_DATA_AVAILABILITY, type BusinessObjective, type ObjectiveResult } from "@/lib/zezinho/objective/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";

/**
 * Inferência de objetivo (Etapa 2 — ver docs/zezinho-3.0-architecture.md, seção 5). Tabela de
 * associação determinística `(intenção, entidade) -> objetivo`, versionada em código (decisão do
 * usuário, item 2: nada configurável fora do código nesta fase).
 *
 * A regra mais importante é a de `recommend` sem entidade nova: reaproveita o objetivo já ativo
 * na sessão em vez de reinferir — é o que faz "o que você faria?" completar a análise anterior em
 * vez de recomeçá-la (bug corrigido na sprint anterior, agora resolvido na raiz pela própria
 * arquitetura, não por um caso especial).
 */

function build(objective: BusinessObjective, rationale: string, reused = false): ObjectiveResult {
  return { objective, reused, rationale, dataAvailability: OBJECTIVE_DATA_AVAILABILITY[objective] };
}

export function inferObjective(intent: ZezinhoIntent, entities: ExtractedEntities, memory: ReasoningSession): ObjectiveResult {
  if (intent === "inform" || intent === "clarify_needed") {
    return { objective: null, reused: false, rationale: "Pergunta factual direta — não precisa de objetivo derivado.", dataAvailability: null };
  }

  // "O que você faria?" sem entidade nova -> reaproveita o objetivo da última análise da sessão.
  if (intent === "recommend" && !entities.topic && !entities.packageMentioned && memory.activeObjective) {
    return build(memory.activeObjective, "Reaproveitado da última análise da sessão (nenhuma entidade nova mencionada).", true);
  }

  if (entities.packageMentioned) {
    return build("improve_service_mix", `Pacote ${entities.packageMentioned} mencionado — objetivo é melhorar o mix de serviço / ticket médio.`);
  }

  if (entities.topic === "preco") return build("evaluate_pricing", "Pergunta sobre preço — objetivo é avaliar o impacto comercial de mexer no preço.");
  if (entities.topic === "equipe") return build("staffing_capacity", "Pergunta sobre equipe/contratação — objetivo é capacidade operacional.");
  if (entities.topic === "clientes") return build("client_retention", "Pergunta sobre clientes/contato — objetivo é retenção/reativação de clientes.");
  if (entities.topic === "caixa") return build("improve_cash_flow", "Pergunta sobre caixa — objetivo é saúde do fluxo de caixa.");

  // explain sem entidade nova continua explicando a última análise, mesmo objetivo dela.
  if (intent === "explain" && memory.activeObjective) {
    return build(memory.activeObjective, "Explicação de uma análise já em andamento — mesmo objetivo dela.", true);
  }

  // Sem entidade específica e sem objetivo herdado: objetivo geral de saúde do negócio.
  return build("business_health", "Nenhuma entidade específica reconhecida — objetivo padrão de saúde geral do negócio.");
}
