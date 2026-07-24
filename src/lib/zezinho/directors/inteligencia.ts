import type { Correlation, DirectorId, DirectorReport } from "@/lib/zezinho/directors/types";
import type { Fact } from "@/lib/zezinho/reasoning/types";

/**
 * Diretor de Inteligência (Sprint 5.0, Z1) — novo componente aprovado pelo usuário. Nunca observa
 * uma fonte própria além de clima (`directors/registry.ts`); a função aqui cruza os
 * `DirectorReport`s de OUTROS Diretores já prontos, sempre exigindo evidência de pelo menos dois
 * domínios diferentes e sempre declarando um nível de confiança — nunca "descobre" uma relação
 * sem essa dupla evidência real.
 *
 * Honestidade sobre o alcance atual: correlações que dependem de série histórica mais longa
 * (sazonalidade, comportamento de clientes ao longo de semanas/meses, eficiência de equipe ao
 * longo do tempo) NÃO são possíveis ainda — dependem da Memória Operacional (checkpoint Z3, ainda
 * não implementada). O conjunto abaixo é deliberadamente pequeno e só cresce com fundamento real,
 * nunca por completude aparente.
 */
export const INTELLIGENCE_SCOPE_LIMITATION =
  "Correlações que dependem de histórico mais longo (sazonalidade, comportamento de clientes ao longo do tempo, eficiência de equipe) ainda não estão disponíveis — dependem da Memória Operacional, prevista para o checkpoint Z3.";

function findReport(reports: DirectorReport[], id: DirectorId): DirectorReport | undefined {
  return reports.find((r) => r.director === id);
}

function findFact(report: DirectorReport, key: string): Fact | undefined {
  return report.facts.find((f) => f.key === key);
}

/**
 * Conjunto inicial de correlações reais (Z1) — cada uma exige evidência de dois Diretores
 * diferentes. Deliberadamente pequeno: melhor duas correlações genuínas do que dez especulativas.
 */
export function deriveCorrelations(reports: DirectorReport[]): Correlation[] {
  const correlations: Correlation[] = [];
  const inteligencia = findReport(reports, "inteligencia");
  const operacoes = findReport(reports, "operacoes");
  const comercial = findReport(reports, "comercial");

  // 1) Clima × Movimento — dois sinais reais e independentes apontando na mesma direção.
  if (inteligencia && operacoes) {
    const weatherRisk = inteligencia.risks.find((r) => r.evidenceFactKeys.includes("weather_current"));
    const movementRisk = operacoes.risks.find((r) => r.evidenceFactKeys.includes("historical_pattern"));
    if (weatherRisk && movementRisk) {
      correlations.push({
        statement:
          "A previsão de chuva nos próximos dias, combinada com o movimento de hoje já abaixo do padrão histórico, é um sinal composto — os dois efeitos podem se somar na demanda de lavação, vale reforçar agendamentos e adicionais antes disso.",
        confidence: "media",
        evidenceFactKeys: ["weather_current", "historical_pattern"],
        directors: ["inteligencia", "operacoes"],
      });
    }
  }

  // 2) CRM × Ticket médio — evidência real, mas de um único período (sem confirmação de
  // tendência entre dias ainda), por isso confiança "baixa", nunca inflada.
  if (comercial && operacoes) {
    const atRiskOpportunity = comercial.opportunities.find((o) => o.evidenceFactKeys.includes("crm_at_risk_count"));
    const avgTicketFact = findFact(operacoes, "avgTicket");
    if (atRiskOpportunity && avgTicketFact && avgTicketFact.direction === "queda") {
      correlations.push({
        statement:
          "Há clientes em risco no CRM no mesmo período em que o ticket médio está em queda — pode valer combinar a reativação desses clientes com uma oferta de adicionais, em vez de tratar as duas coisas separadamente.",
        confidence: "baixa",
        evidenceFactKeys: ["crm_at_risk_count", "avgTicket"],
        directors: ["comercial", "operacoes"],
      });
    }
  }

  return correlations;
}
