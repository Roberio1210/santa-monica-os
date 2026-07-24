import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { ZezinhoTopic } from "@/lib/zezinho/intent/types";
import type { Capability } from "@/lib/zezinho/planner/capabilities";
import type { ContextQuality } from "@/lib/zezinho/planner/contextQuality";
import type { ConfidenceLevel, EvidencedClaim, Fact, Recommendation } from "@/lib/zezinho/reasoning/types";

/**
 * Diretoria Inteligente (Sprint 5.0, Z1) — ver docs/diretoria-inteligente-architecture.md. Um
 * `Director` NÃO é um agente de IA autônomo: é metadado de agrupamento por domínio sobre as
 * mesmas ferramentas/capacidades que já existem desde a Sprint 4.0 (`tools/registry.ts`,
 * `planner/capabilities.ts`) — o mesmo espírito de `TOOL_REGISTRY`, um nível acima. Quem busca
 * dado continua sendo só `OperationalContextBuilder`; nenhuma chamada de I/O nova nasce aqui.
 */
export type DirectorId = "financeiro" | "comercial" | "marketing" | "operacoes" | "estoque" | "rh" | "estrategico" | "inteligencia";

/**
 * Declarado, nunca inferido às escondidas (mesmo princípio de honestidade da Sprint 1 em diante):
 * `real` = todas as capacidades do diretor têm fonte de dado real hoje; `parcial` = mistura de
 * real e indisponível (ex.: Comercial tem CRM real, mas follow-up de mensagens ainda não);
 * `indisponivel` = nenhuma fonte real existe ainda (RH, Marketing) — o diretor participa da
 * arquitetura desde já, mas todo relatório seu diz isso explicitamente, nunca inventa dado.
 */
export type DirectorDataAvailability = "real" | "parcial" | "indisponivel";

export type PriorityLevel = "alta" | "media" | "baixa";

/**
 * O que um Diretor produz ao ser executado — nunca texto pronto (isso é trabalho do narrador,
 * seção 2 do Z4), só material estruturado e evidenciado, no mesmo padrão de `ManagerialPlan`
 * (Sprint 4.0, Z3), só que escopado a um domínio.
 */
export interface DirectorReport {
  director: DirectorId;
  generatedAt: string;
  dataAvailability: DirectorDataAvailability;
  facts: Fact[];
  risks: EvidencedClaim[];
  opportunities: EvidencedClaim[];
  recommendations: Recommendation[];
  /** Prioridade preliminar do relatório como um todo — versão simples no Z1, formalizada em `computePriority` no Z2. */
  priority: PriorityLevel;
  confidence: ContextQuality;
  limitations: string[];
  /**
   * Nota de tendência entre dias/semanas ("já é o 3º dia de queda no ticket médio"). Sempre
   * `null` no Z1 — a Memória Operacional (tabela `director_observations`, decisão aprovada do
   * usuário) só existe a partir do checkpoint Z3.
   */
  memoryNote: string | null;
  /** Já resolvido pelo `participationCriteria` do diretor (seção "KPIs de participação") — o narrador do Executive Briefing (Z4) só precisa filtrar por isto, nunca reavaliar critério. */
  shouldParticipateInBriefing: boolean;
}

/**
 * Metadado de um Diretor — o equivalente de `ToolDefinition` (`tools/types.ts`) um nível acima.
 * `participationCriteria` é o "KPI objetivo" pedido pelo usuário para decidir presença no
 * Executive Briefing: uma função pura sobre o próprio `DirectorReport` já calculado, nunca uma
 * escolha arbitrária de IA. Diretores sem fonte real (`dataAvailability: "indisponivel"`) usam
 * um critério que sempre devolve `false` — nunca poluem o briefing diário com "ainda sem fonte"
 * repetido todo dia; continuam plenamente consultáveis sob demanda (uma pergunta direta sobre
 * aquele domínio ainda os aciona, exatamente como hoje já acontece com `unanswered_clients`/
 * `agenda_summary`/`marketing_summary` no catálogo de ferramentas).
 */
export interface Director {
  id: DirectorId;
  label: string;
  ownedCapabilities: Capability[];
  dataAvailability: DirectorDataAvailability;
  /** Usado por `deriveRecommendations` (reaproveitado de `reasoning/recommend.ts`, sem duplicar lógica por domínio). */
  defaultObjective: BusinessObjective | null;
  /** Usado como `entities.topic` sintético quando o Diretor roda fora de uma pergunta específica do usuário (ex.: no Executive Briefing). */
  defaultTopic: ZezinhoTopic | null;
  participationCriteria: (report: DirectorReport) => boolean;
}

/**
 * Diretor de Inteligência (novo componente, aprovado pelo usuário) — nunca observa uma fonte
 * própria, só cruza os `DirectorReport`s dos demais Diretores. Uma `Correlation` só existe com
 * evidência real (`evidenceFactKeys` apontando para `Fact`s de dois ou mais Diretores) e sempre
 * carrega o nível de confiança — nunca uma relação "descoberta" sem essa dupla evidência.
 */
export interface Correlation {
  statement: string;
  confidence: ConfidenceLevel;
  evidenceFactKeys: string[];
  /** Quais Diretores contribuíram fatos para esta correlação — nunca menos de 2 (senão não é uma correlação, é um fato de um domínio só). */
  directors: DirectorId[];
}

/**
 * Saída do Diretor Estratégico (`directors/estrategico.ts`) — no Z1, consolidação simples
 * (concatenação + prioridade geral); a deduplicação semântica entre Diretores (seção "Diretor
 * Estratégico — a consolidação" do documento de arquitetura) é trabalho do Z2.
 */
export interface ConsolidatedReport {
  generatedAt: string;
  /** Todos os relatórios de origem, preservados por completo — nunca descartados, só resumidos na prosa final ("Ver fundamentos" continua íntegro). */
  reports: DirectorReport[];
  risks: EvidencedClaim[];
  opportunities: EvidencedClaim[];
  recommendations: Recommendation[];
  correlations: Correlation[];
  overallPriority: PriorityLevel;
  limitations: string[];
  /** Diretores cujo `participationCriteria` deu `true` — é exatamente a lista que o Executive Briefing (Z4) narra. */
  participatingDirectors: DirectorId[];
}
