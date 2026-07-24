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
 * Hipótese (Sprint 5.0, Z2 — "Sistema Executivo de Decisão", decisão do usuário) — nunca um
 * fato. É uma interpretação candidata sobre POR QUE os fatos são o que são, sempre presa a
 * evidência real e a um nível de confiança explícito. Construída a partir do `Diagnosis`
 * (`reasoning/diagnose.ts`, inalterado desde a Sprint 3.0) por `directors/hypotheses.ts` — nunca
 * um cálculo novo, só uma forma mais rica de expor o que o motor de raciocínio já produzia.
 * `confidenceScore` é numérico (0-100) só para uso estrutural/rastreável ("Ver fundamentos");
 * a prosa final ao usuário (narrador, fora do escopo do Z2) continua seguindo a regra da Sprint
 * 4.0/Z4: nunca um percentual solto sem explicação, sempre `confidenceLevel` + `basis` juntos.
 */
export interface Hypothesis {
  description: string;
  /** Evidências favoráveis — chaves de `Fact` usadas, rastreável, técnico. */
  evidenceFactKeys: string[];
  /**
   * Evidências contrárias (Sprint 5.0, Z3A, decisão do usuário: "toda hipótese poderá conter
   * evidências favoráveis e evidências contrárias — isso melhora o cálculo de confiança").
   * Sempre vazia até a Revisão Cruzada (`directors/crossReview.ts`) rodar — nunca preenchida por
   * suposição, só quando outro Diretor apresenta evidência real que aponta na direção oposta.
   */
  contraryEvidenceFactKeys: string[];
  /** Rótulos legíveis das fontes usadas (ex.: "clima", "histórico", "operação") — o que o usuário reconhece, não a chave interna. */
  basis: string[];
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  limitations: string[];
}

/**
 * Revisão Cruzada (Sprint 5.0, Z3A, novo componente, decisão do usuário) — "os Diretores devem
 * poder confirmar, complementar ou contestar hipóteses uns dos outros antes da consolidação do
 * Diretor Estratégico". Uma `HypothesisReview` só existe quando o Diretor revisor tem evidência
 * PRÓPRIA real no mesmo domínio da hipótese (`directors/crossReview.ts`) — nunca uma opinião sem
 * lastro. `confirma` = revisor tem risco/oportunidade no mesmo domínio, mesma leitura;
 * `contesta` = revisor tem oportunidade onde a hipótese aponta risco (ou vice-versa) no mesmo
 * domínio — uma tensão real entre leituras independentes; `complementa` = evidência relacionada,
 * mas sem confirmar nem contestar diretamente.
 */
export type ReviewStance = "confirma" | "complementa" | "contesta";

export interface HypothesisReview {
  reviewerDirector: DirectorId;
  stance: ReviewStance;
  statement: string;
  evidenceFactKeys: string[];
}

/** Uma hipótese de um Diretor, já com as revisões dos demais e a confiança recalculada considerando evidência contrária. */
export interface ReviewedHypothesis extends Hypothesis {
  sourceDirector: DirectorId | null;
  reviews: HypothesisReview[];
}

/**
 * Avaliação de impacto (Sprint 5.0, Z2) — alimenta `computePriority` (`directors/priority.ts`).
 * Cada campo é classificado por regra explicável (mesmo espírito de `computeContextQuality`),
 * nunca uma pontuação arbitrária. `directorsInvolved` é 1 para um risco/oportunidade de um único
 * domínio, e >1 quando vem de uma correlação (Diretor de Inteligência) ou hipótese cruzada
 * (Diretor Estratégico) — "quantidade de Diretores envolvidos" é literalmente um dos critérios
 * pedidos pelo usuário.
 */
export interface ImpactAssessment {
  financialImpact: "alto" | "medio" | "baixo" | "indeterminado";
  operationalImpact: "alto" | "medio" | "baixo" | "indeterminado";
  urgency: "alta" | "media" | "baixa";
  dataConfidence: ConfidenceLevel;
  directorsInvolved: number;
}

/**
 * Estados do Plano de Ação (Sprint 5.0, Z2, decisão do usuário) — só a arquitetura nesta
 * checkpoint, nenhuma persistência ainda. Todo `ActionPlan` recém-gerado nasce `identificado`;
 * as transições seguintes (sugerido/aprovado/em_execucao/concluido/descartado) exigem uma
 * decisão humana registrada em algum lugar — isso é trabalho de uma sprint futura, quando a
 * persistência (Memória Operacional, Z3B, ou uma tabela própria) existir.
 */
export type ActionPlanStatus = "identificado" | "sugerido" | "aprovado" | "em_execucao" | "concluido" | "descartado";

export interface ActionPlan {
  id: string;
  status: ActionPlanStatus;
  action: string;
  reason: string;
  priority: PriorityLevel;
  /** `null` até existir um módulo de RH/equipe real (mesma honestidade de `DirectorDataAvailability`). */
  responsible: string | null;
  expectedImpact: string;
  /** `null` quando não há base real para estimar prazo — nunca um prazo inventado. */
  suggestedDeadline: string | null;
  evidenceFactKeys: string[];
}

/**
 * O que um Diretor produz ao ser executado — nunca texto pronto (isso é trabalho do narrador,
 * seção 2 do Z4), só material estruturado e evidenciado. A partir da Z2, todo relatório segue as
 * 8 seções obrigatórias pedidas pelo usuário: fatos, diagnóstico, hipóteses, confiança, riscos,
 * oportunidades, recomendações, plano de ação.
 */
export interface DirectorReport {
  director: DirectorId;
  generatedAt: string;
  dataAvailability: DirectorDataAvailability;
  /** 1. Fatos observados. */
  facts: Fact[];
  /** 2. Diagnóstico — leitura síntese em uma frase (a hipótese principal, quando existir evidência para uma). */
  diagnosis: string | null;
  /** 3. Hipóteses — a principal (index 0, quando existir) + alternativas, nunca fatos disfarçados. */
  hypotheses: Hypothesis[];
  /** 4. Grau de confiança (reaproveita `ContextQuality`, Sprint 4.0/Z3 — nunca recalculado). */
  confidence: ContextQuality;
  /** 5. Riscos. */
  risks: EvidencedClaim[];
  /** 6. Oportunidades. */
  opportunities: EvidencedClaim[];
  /** 7. Recomendações. */
  recommendations: Recommendation[];
  /** 8. Plano de ação — um `ActionPlan` por recomendação, nunca menos informativo que a recomendação que o originou. */
  actionPlans: ActionPlan[];
  /** Prioridade do relatório como um todo — Z2: `computePriority(impact)`, formal e explicável (`directors/priority.ts`). */
  priority: PriorityLevel;
  impact: ImpactAssessment;
  limitations: string[];
  /**
   * Nota de tendência entre dias/semanas ("já é o 3º dia de queda no ticket médio"). Sempre
   * `null` até o checkpoint Z3B (Memória Operacional persistente, decisão aprovada do usuário).
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
 * As três perguntas centrais da tomada de decisão (Sprint 5.0, Z2, seção "Decisões" — decisão do
 * usuário: "esse passa a ser o núcleo da tomada de decisão"). Cada resposta é derivada só do que
 * já está em `ConsolidatedReport` — nunca uma pergunta respondida sem evidência correspondente.
 */
export interface ExecutiveDecisions {
  /** 1. O que merece minha atenção hoje? — riscos/oportunidades/hipóteses de prioridade alta, limitado a 3 (mesma disciplina de "no máximo 3 pontos" desde o Z4). */
  whatDeservesAttentionToday: EvidencedClaim[];
  /** 2. O que eu faria primeiro? — a única recomendação de maior prioridade, ou `null` quando não há nenhuma recomendação sustentada. */
  whatIWouldDoFirst: Recommendation | null;
  /** 3. O que pode esperar? — itens de prioridade baixa, explicitamente despriorizados, nunca escondidos. */
  whatCanWait: EvidencedClaim[];
}

/**
 * Executive Advice (novo componente, Sprint 5.0, Z2, decisão do usuário) — "Meu conselho para
 * hoje", sempre fundamentado nos mesmos dados de `ConsolidatedReport`, nunca opinião solta. A
 * prosa final ("Se eu estivesse administrando a empresa hoje, minha prioridade seria...") é
 * trabalho do narrador, fora do escopo do Z2 — aqui só a estrutura e a evidência por trás dela.
 */
export interface ExecutiveAdvice {
  statement: string;
  basedOnFactKeys: string[];
  confidence: ConfidenceLevel;
}

/**
 * Saída do Diretor Estratégico (`directors/estrategico.ts`). Z1: consolidação simples
 * (concatenação + prioridade geral). Z2 (Sistema Executivo de Decisão, decisão do usuário):
 * ganha hipóteses cruzadas entre Diretores (contradições/padrões, nunca inventadas), plano de
 * ação agregado, as três Decisões e o Executive Advice. A deduplicação semântica fina entre
 * riscos/oportunidades individuais de Diretores diferentes (para além dos padrões nomeados
 * abaixo) continua um refinamento futuro, não bloqueia esta checkpoint.
 */
export interface ConsolidatedReport {
  generatedAt: string;
  /** Todos os relatórios de origem, preservados por completo — nunca descartados, só resumidos na prosa final ("Ver fundamentos" continua íntegro). */
  reports: DirectorReport[];
  risks: EvidencedClaim[];
  opportunities: EvidencedClaim[];
  recommendations: Recommendation[];
  actionPlans: ActionPlan[];
  correlations: Correlation[];
  /** Hipóteses cruzadas entre Diretores (seção "Contradições" — o nome do usuário para o mecanismo; tecnicamente são hipóteses evidenciadas por >=2 Diretores, nunca uma "IA arbitrando"). */
  crossDirectorHypotheses: Hypothesis[];
  /**
   * Todas as hipóteses (de cada Diretor + as cruzadas) já passadas pela Revisão Cruzada (Sprint
   * 5.0, Z3A) — confiança recalculada com evidência favorável/contrária. Dado adicional para
   * transparência; `reports[].hypotheses` continua intocado como registro original de auditoria.
   */
  reviewedHypotheses: ReviewedHypothesis[];
  decisions: ExecutiveDecisions;
  advice: ExecutiveAdvice;
  overallPriority: PriorityLevel;
  limitations: string[];
  /** Diretores cujo `participationCriteria` deu `true` — é exatamente a lista que o Executive Briefing (Z4) narra. */
  participatingDirectors: DirectorId[];
}

// --- Memória Conversacional Gerencial (Sprint 5.0, Z3A, decisão do usuário) ---
// "O Zézinho deve manter contexto durante toda a conversa... essa memória dura apenas durante a
// conversa. Não deve ser persistida." Mesma natureza de `memory/types.ts:ReasoningSession`
// (client-side, nunca toca o banco) — só que carregando as estruturas ricas da Diretoria em vez
// de período/objetivo simples.

/** Um turno da conversa — a pergunta e o que a Diretoria concluiu para ela naquele momento. */
export interface ConversationTurn {
  askedAt: string;
  question: string;
  hypotheses: Hypothesis[];
  decisions: ExecutiveDecisions | null;
  recommendations: Recommendation[];
  actionPlans: ActionPlan[];
}

export interface ConversationalMemory {
  turns: ConversationTurn[];
}

// --- Executive Timeline (Sprint 5.0, Z3A, novo componente, decisão do usuário) ---
// "Resumir: últimos dias, mudanças, tendências, acontecimentos importantes. Ainda sem
// persistência, apenas arquitetura." Sem um banco de observações diárias (isso é o Z3B), a única
// fonte real disponível hoje é a própria `ConversationalMemory` da sessão — a MESMA estrutura
// (`TimelineEntry`) será alimentada por dado persistido real quando o Z3B existir, sem precisar
// ser redesenhada.

export interface TimelineEntry {
  date: string;
  summary: string;
  /** O que mudou desde a entrada anterior — diff real entre turnos, nunca inventado. */
  changes: string[];
  importantEvents: string[];
}

export interface ExecutiveTimeline {
  entries: TimelineEntry[];
  /** Honesto quando não há entradas suficientes para apontar uma tendência (mesma disciplina de `historical-pattern.ts`, Sprint 4.0/Z2). */
  trends: string[];
}
