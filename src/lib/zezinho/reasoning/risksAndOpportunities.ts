import type { OperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import type { EvidencedClaim, Fact } from "@/lib/zezinho/reasoning/types";

/**
 * Riscos e oportunidades candidatos (Sprint 4.0, Z3, seção 9) — cada um só existe se houver
 * evidência real por trás (fato correspondente presente e com status "ok"). Nunca deriva de
 * fonte ausente/falha. Extraído de `planner/managerialPlan.ts` na Sprint 5.0 (Z1) para ser
 * reaproveitado também por `directors/runDirector.ts` — a função já é genérica o bastante: só
 * reage às capacidades que estiverem em `context.byCapability`, então um Diretor com um
 * `OperationalContext` mais estreito (ex.: só `cash_ledger_totals`+`accounts_payable`) recebe
 * naturalmente só os riscos/oportunidades daquele domínio, sem nenhum código a mais.
 */

const RAIN_RISK_THRESHOLD_DAYS = 2;
const VEHICLES_BELOW_TYPICAL_RATIO = 0.7;

export function deriveRisksAndOpportunities(context: OperationalContext, facts: Fact[]): { risks: EvidencedClaim[]; opportunities: EvidencedClaim[] } {
  const risks: EvidencedClaim[] = [];
  const opportunities: EvidencedClaim[] = [];
  const factByKey = new Map(facts.map((f) => [f.key, f]));

  const weather = context.byCapability.weather_forecast;
  if (weather?.id === "weather_forecast" && weather.status === "ok" && weather.forecast.current) {
    const upcoming = weather.forecast.dailyForecast.slice(0, RAIN_RISK_THRESHOLD_DAYS);
    const willRainSoon = upcoming.some((d) => d.willRain);
    if (willRainSoon) risks.push({ statement: "Previsão de chuva nos próximos dias pode reduzir a demanda de lavação.", evidenceFactKeys: ["weather_current"] });
    const todayDry = !upcoming[0]?.willRain;
    const rainsLater = upcoming.slice(1).some((d) => d.willRain);
    if (todayDry && rainsLater) opportunities.push({ statement: "Tempo firme agora e chuva prevista em breve — janela boa para atrair clientes indecisos antes que a demanda de lavação suba de repente.", evidenceFactKeys: ["weather_current"] });
  }

  const historical = context.byCapability.historical_pattern;
  const jumppark = context.byCapability.jumppark_period_summary;
  if (historical?.id === "historical_pattern" && historical.status === "ok" && historical.pattern && historical.pattern.sampleQuality !== "insuficiente" && historical.pattern.typicalVehicles !== null) {
    if (jumppark?.id === "jumppark_period_summary" && jumppark.status === "ok") {
      const vehiclesMetric = jumppark.metrics.find((m) => m.key === "vehicles");
      if (vehiclesMetric && vehiclesMetric.a < historical.pattern.typicalVehicles * VEHICLES_BELOW_TYPICAL_RATIO) {
        risks.push({ statement: "Movimento de hoje está abaixo do padrão histórico para este dia da semana.", evidenceFactKeys: ["historical_pattern", "vehicles"] });
      }
    }
  }

  const goal = context.byCapability.goal_progress;
  if (goal?.id === "goal_progress" && goal.status === "ok" && goal.progress) {
    if (goal.progress.pace === "abaixo_do_ritmo") risks.push({ statement: "O ritmo atual está abaixo do necessário para atingir a meta no período.", evidenceFactKeys: ["goal_progress"] });
    if (goal.progress.pace === "acima_do_ritmo") opportunities.push({ statement: "O ritmo atual está acima do necessário — pode valer reforçar oferta para consolidar essa vantagem antes que o ritmo caia.", evidenceFactKeys: ["goal_progress"] });
  }

  const payable = context.byCapability.accounts_payable;
  if (payable?.id === "accounts_payable" && payable.status === "ok" && payable.summary && payable.summary.totalOverdue > 0) {
    risks.push({ statement: "Há contas a pagar vencidas em aberto.", evidenceFactKeys: ["accounts_payable"] });
  }

  if (factByKey.has("crm_at_risk_count")) {
    const f = factByKey.get("crm_at_risk_count")!;
    opportunities.push({ statement: `${f.statement} Oportunidade de reativação com contato direto.`, evidenceFactKeys: ["crm_at_risk_count"] });
  }

  return { risks, opportunities };
}
