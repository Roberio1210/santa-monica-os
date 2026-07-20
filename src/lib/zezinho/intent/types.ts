import type { ParsedComparison } from "@/lib/zezinho/date-parser";
import type { PeriodRange } from "@/lib/utils/timezone";

/**
 * Intenção real por trás de uma pergunta (Etapa 1 do pipeline de raciocínio — ver
 * docs/zezinho-3.0-architecture.md, seção 4). Substitui a cadeia de `if`s dispersa em
 * `service.ts` (2.0) por uma classificação explícita, sempre executada primeiro — o bug corrigido
 * na sprint anterior (contexto atropelando a intenção nova) era sintoma direto de decidir isso via
 * ordem de checagem espalhada pelo código.
 */
export type ZezinhoIntent =
  | "diagnose"
  | "recommend"
  | "evaluate_decision"
  | "explain"
  | "compare"
  | "inform"
  | "status_check"
  | "clarify_needed";

export type ZezinhoTopic = "preco" | "equipe" | "clientes" | "estoque" | "caixa" | "marketing" | "agenda" | "mix";

export type ZezinhoPackage = "Bronze" | "Silver" | "Gold";

/**
 * Entidades extraídas do texto — período/comparação (reaproveita `date-parser.ts` sem duplicar
 * lógica de data), filtro de área, pacote citado e tópico de negócio. Nenhuma extração aqui faz
 * I/O; é só reconhecimento de texto.
 */
export interface ExtractedEntities {
  comparison: ParsedComparison | null;
  singlePeriod: PeriodRange | null;
  areaFilter: "lavacao" | "estacionamento" | null;
  packageMentioned: ZezinhoPackage | null;
  topic: ZezinhoTopic | null;
}

export interface IntentResult {
  intent: ZezinhoIntent;
  entities: ExtractedEntities;
  /** Explicação curta de por que essa intenção foi escolhida — para depuração/testes, não para o usuário. */
  rationale: string;
}
