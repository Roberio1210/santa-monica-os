import type { Director, DirectorId, DirectorReport } from "@/lib/zezinho/directors/types";

/**
 * Critério padrão de participação no Executive Briefing (seção "KPIs de participação", decisão
 * do usuário): objetivo e determinístico — participa quando o próprio relatório já calculado
 * (`DirectorReport.priority`, seção `runDirector.ts`) não é `baixa`. Nunca uma escolha de IA;
 * nunca reavalia o relatório, só lê o que já foi calculado. Diretores reais/parciais usam este
 * critério por padrão no Z1; o Z2 (sistema de prioridade formal) pode refinar por diretor com
 * limiares próprios (ex.: Estoque participar sempre que houver item quase vazio, mesmo se a
 * prioridade geral do relatório for baixa) sem mudar esta interface.
 */
function participatesUnlessLowPriority(report: DirectorReport): boolean {
  return report.priority !== "baixa";
}

/** Diretores sem fonte real nunca poluem o Executive Briefing diário com "ainda sem fonte" repetido — continuam plenamente consultáveis sob demanda (uma pergunta direta ainda os aciona). */
function neverParticipatesAutomatically(): boolean {
  return false;
}

/**
 * Registro estático dos Diretores (Sprint 5.0, Z1) — dado puro, mesmo padrão de
 * `tools/registry.ts`. `ownedCapabilities` reaproveita exatamente as `Capability` já existentes
 * (`planner/capabilities.ts`) — nenhuma capacidade nova nasce aqui. RH e Marketing entram desde
 * já na arquitetura (decisão do usuário), sempre honestos sobre a ausência de fonte real.
 */
export const DIRECTOR_REGISTRY: Record<DirectorId, Director> = {
  financeiro: {
    id: "financeiro",
    label: "Diretor Financeiro",
    // "stone_reconciliation_summary" (Z2), "stone_financial_schedule"/"stone_jumppark_reconciliation"
    // (Z3, Sprint 7.0) — capacidades financeiras novas, só do Financeiro. Nunca aparecem em
    // INTENT_CAPABILITIES (planner/capabilities.ts) — decisão do usuário de não conectar ao chat/
    // CEO Virtual/Reflection Engine/Observer ainda nestes checkpoints.
    ownedCapabilities: ["cash_ledger_totals", "accounts_payable", "accounts_receivable", "goal_progress", "dre_result", "stone_reconciliation_summary", "stone_financial_schedule", "stone_jumppark_reconciliation"],
    dataAvailability: "real",
    defaultObjective: "improve_cash_flow",
    defaultTopic: "caixa",
    participationCriteria: participatesUnlessLowPriority,
  },
  operacoes: {
    id: "operacoes",
    label: "Diretor de Operações",
    ownedCapabilities: ["situational_context", "jumppark_period_summary", "historical_pattern", "staffing_capacity", "jumppark_wash_packages", "agenda_summary"],
    dataAvailability: "real",
    defaultObjective: "business_health",
    defaultTopic: null,
    participationCriteria: participatesUnlessLowPriority,
  },
  estoque: {
    id: "estoque",
    label: "Diretor de Estoque",
    ownedCapabilities: ["inventory_status"],
    dataAvailability: "real",
    defaultObjective: "reduce_costs",
    defaultTopic: "estoque",
    participationCriteria: participatesUnlessLowPriority,
  },
  comercial: {
    id: "comercial",
    label: "Diretor Comercial",
    // `unanswered_clients` está aqui porque é o domínio certo (follow-up de clientes) — sempre
    // `not_configured` até o WhatsApp ser integrado (Fase B), nunca escondido do relatório.
    ownedCapabilities: ["crm_summary", "unanswered_clients"],
    dataAvailability: "parcial",
    defaultObjective: "client_retention",
    defaultTopic: "clientes",
    participationCriteria: participatesUnlessLowPriority,
  },
  marketing: {
    id: "marketing",
    label: "Diretor de Marketing",
    ownedCapabilities: ["marketing_summary"],
    dataAvailability: "indisponivel",
    defaultObjective: null,
    defaultTopic: "marketing",
    participationCriteria: neverParticipatesAutomatically,
  },
  rh: {
    id: "rh",
    label: "Diretor de RH",
    // Nenhuma capacidade própria hoje — não existe módulo de RH real (docs/hr-module-architecture.md
    // nunca foi implementado). `staffing_capacity` continua sendo só o proxy do Diretor de
    // Operações; dar a mesma capacidade ao RH duplicaria o mesmo dado como se fossem duas
    // observações independentes, o que não é honesto.
    ownedCapabilities: [],
    dataAvailability: "indisponivel",
    defaultObjective: "staffing_capacity",
    defaultTopic: "equipe",
    participationCriteria: neverParticipatesAutomatically,
  },
  estrategico: {
    id: "estrategico",
    label: "Diretor Estratégico",
    // `central_alerts` é a única fonte genuinamente transversal (já cruza estoque/financeiro/
    // operações hoje, ver `operations/central.ts`) — o resto do trabalho do Estratégico não é
    // observar, é consolidar os relatórios dos demais (ver `directors/estrategico.ts`).
    ownedCapabilities: ["central_alerts"],
    dataAvailability: "real",
    defaultObjective: "business_health",
    defaultTopic: null,
    participationCriteria: () => true,
  },
  inteligencia: {
    id: "inteligencia",
    label: "Diretor de Inteligência",
    // Clima não pertence a nenhum diretor operacional sozinho — é justamente o tipo de sinal que
    // o Diretor de Inteligência cruza contra os fatos de outros diretores (ex.: clima × movimento
    // de Operações), nunca uma observação de departamento isolado.
    ownedCapabilities: ["weather_forecast"],
    dataAvailability: "real",
    defaultObjective: null,
    defaultTopic: null,
    participationCriteria: participatesUnlessLowPriority,
  },
};

/** Diretores que observam um domínio próprio (excluem Estratégico/Inteligência, que consolidam/cruzam, nunca observam sozinhos). */
export const OBSERVER_DIRECTOR_IDS: DirectorId[] = ["financeiro", "operacoes", "estoque", "comercial", "marketing", "rh"];
