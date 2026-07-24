import type { ConfidenceLevel, FactDirection } from "@/lib/zezinho/reasoning/types";
import type { ConsolidatedReport, DirectorId } from "@/lib/zezinho/directors/types";

/**
 * Memória Organizacional do Santa Monica OS (Sprint 5.0, Z3B, decisão do usuário — ampliação do
 * escopo original "Memória Operacional"). O sistema não deve só armazenar eventos: deve aprender.
 * Pipeline: Evento (`Fact`, já existe, nunca persistido isoladamente) → Observação → Aprendizado →
 * Conhecimento. Só conhecimentos consolidados permanecem indefinidamente; observações sem
 * confirmação expiram automaticamente ("esquecimento" explícito, nunca lixo histórico).
 *
 * Quatro tipos de memória, cada um com regras próprias de retenção:
 * 1. Memória Operacional (`DirectorDailySnapshot`) — problemas recentes, retenção curta (dias/semanas).
 * 2. Memória Estratégica (`StrategicMemoryItem`) — metas/projetos/objetivos, nunca expira.
 * 3. Memória Organizacional (`Learning`) — aprendizados/padrões/regras descobertas, pipeline de
 *    confirmação (nunca promovido sem evidência de recorrência real).
 * 4. Memória Conversacional (`ConversationalMemory`, `directors/conversationalMemory.ts`, Z3A) —
 *    já implementada, session-only, nunca persistida — não faz parte deste módulo.
 *
 * Nota de nomenclatura: o termo "observação" aparece em dois lugares com sentidos diferentes —
 * `DirectorDailySnapshot` é a leitura bruta do dia (Memória Operacional, seção 4 da arquitetura
 * original); `LearningStatus === "observacao"` é o primeiro estágio do pipeline de conhecimento
 * (Memória Organizacional, este arquivo). São conceitos distintos que compartilham a palavra em
 * português — por isso as entidades TS têm nomes técnicos diferentes (`DirectorDailySnapshot` vs.
 * `Learning`) mesmo com o enum de status reaproveitando o vocabulário exato do usuário.
 */

// --- 1. Memória Operacional — leitura diária por Diretor (retenção curta) ---

/**
 * Uma leitura por Diretor por dia (`directorId` + `snapshotDate` únicos) — nunca mais de uma,
 * sempre atualizada em vez de duplicada quando a Diretoria roda mais de uma vez no mesmo dia.
 * Alimenta `computeMemoryNote` (`organizationalMemory/snapshot.ts`) para notas como "já é o 3º dia
 * de queda no ticket médio" — nunca inventado, sempre comparação real entre dias.
 */
export interface DirectorDailySnapshot {
  id: string;
  directorId: DirectorId;
  /** Data no formato `YYYY-MM-DD`, sempre a data local do negócio — nunca um timestamp. */
  snapshotDate: string;
  summary: string;
  /** `null` quando o dia não teve um sinal dominante claro para acompanhar (relatório sem fatos, ex.: RH). */
  metricKey: string | null;
  direction: FactDirection;
  evidenceFactKeys: string[];
  createdAt: string;
}

// --- 2. Memória Estratégica — metas/projetos/objetivos (nunca expira) ---

export type StrategicMemoryItemKind = "meta" | "projeto" | "objetivo";

/**
 * Hoje só `kind: "meta"` é populado de verdade — a única fonte real disponível é o Fact
 * `goal_progress` (metas de faturamento já cadastradas, `db/schema/goals.ts`). "Projeto" e
 * "objetivo" existem no tipo porque são conceitualmente permanentes como as metas, mas sem uma
 * fonte real hoje — nunca inventados, ficam para quando existir um módulo de projetos/OKRs.
 */
export interface StrategicMemoryItem {
  id: string;
  kind: StrategicMemoryItemKind;
  title: string;
  description: string;
  evidenceFactKeys: string[];
  firstObservedAt: string;
  lastConfirmedAt: string;
  active: boolean;
}

// --- 3. Memória Organizacional — pipeline de aprendizado (`Learning`) ---

/**
 * Evento → Observação → Aprendizado → Conhecimento (decisão do usuário). "Evento" é o `Fact`/
 * `Hypothesis` já calculado a cada execução, nunca persistido isoladamente — o pipeline persistido
 * começa em `"observacao"`. `"descartado"` é reservado para invalidação explícita por evidência
 * contrária real (nunca por passagem de tempo — só `"observacao"` expira por tempo; a partir de
 * `"aprendizado"` uma entrada só sai por evidência, nunca automaticamente, mesmo princípio de
 * "nunca promover sem evidência" aplicado também a não-demover).
 */
export type LearningStatus = "observacao" | "aprendizado" | "conhecimento" | "descartado";

/**
 * Um aprendizado — nunca uma afirmação solta. Contém exatamente os campos pedidos pelo usuário:
 * descrição, origem (`directorId`), evidências, primeira ocorrência, última confirmação, nível de
 * confiança, status. `signalKey` é interno (nunca exposto ao usuário) — chave normalizada usada
 * para reconhecer quando uma nova ocorrência é "a mesma" observação recorrente (`deriveSignalKey`,
 * `organizationalMemory/learnings.ts`).
 */
export interface Learning {
  id: string;
  directorId: DirectorId;
  signalKey: string;
  description: string;
  evidenceFactKeys: string[];
  status: LearningStatus;
  confidenceLevel: ConfidenceLevel;
  /** Quantas vezes esta observação foi reconfirmada (inclui a primeira ocorrência = 1). */
  confirmationCount: number;
  firstObservedAt: string;
  lastConfirmedAt: string;
  /** Só preenchido enquanto `status === "observacao"` — `null` a partir de `"aprendizado"` (nunca mais expira por tempo, só por evidência contrária). */
  expiresAt: string | null;
  limitations: string[];
}

// --- 4. Crenças da empresa — princípios permanentes ---

/**
 * Princípios permanentes do negócio (decisão do usuário: "qualidade acima da velocidade",
 * "oferecer adicionais quando fizer sentido", "foco na experiência do cliente", "manter
 * comunicação ativa com leads" — mais os princípios não-negociáveis já documentados no contexto
 * do cliente). Influenciam recomendações futuras por sobreposição real de palavras-chave
 * (`findRelevantBeliefs`, `organizationalMemory/beliefs.ts`) — nunca uma pontuação numérica
 * inventada, só uma correspondência honesta e explicável.
 */
export interface Belief {
  id: string;
  statement: string;
  category: string | null;
  source: string;
  active: boolean;
}

// --- Snapshot consolidado — o que a Diretoria sabe/aprendeu, pronto para o narrador do Executive Briefing ---

/**
 * Resposta estruturada para "o que aprendemos recentemente?" (decisão do usuário) — a prosa final
 * é trabalho do narrador do Executive Briefing (fora do escopo deste checkpoint, mesma divisão de
 * trabalho de `ExecutiveAdvice`/`ExecutiveDecisions` desde o Z2); aqui só estrutura e evidência.
 */
export interface OrganizationalMemorySnapshot {
  /** Aprendizados/conhecimentos confirmados recentemente (nunca inclui `status: "observacao"` — só o que já passou por alguma confirmação real). */
  recentLearnings: Learning[];
  activeBeliefs: Belief[];
  strategicItems: StrategicMemoryItem[];
  /** Quantas observações não confirmadas foram esquecidas (expiradas) nesta execução — transparência sobre o mecanismo de esquecimento, nunca escondido. */
  expiredObservationsCount: number;
  limitations: string[];
}

/**
 * `runDiretoria` (`directors/diretoria.ts`) passa a devolver isto em vez de só `ConsolidatedReport`
 * — `consolidate()` (`estrategico.ts`) continua puro/síncrono/sem I/O, como desde o Z1; a leitura/
 * escrita da Memória Organizacional é responsabilidade só do orquestrador (`diretoria.ts`) e do seu
 * `service.ts`, nunca dos Diretores individuais.
 */
export interface DiretoriaRunResult {
  consolidated: ConsolidatedReport;
  organizationalMemory: OrganizationalMemorySnapshot;
}
