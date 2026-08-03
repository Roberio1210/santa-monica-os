import { recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { deriveDiagnosticSuggestions } from "@/lib/attendance/diagnosticRecommendations";
import type { Diagnostic } from "@/lib/attendance/types";
import { formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { CrmTimelineEntry, SmartRecommendation } from "@/lib/crm-intelligente/types";

/**
 * "O QUE FAZ SENTIDO OFERECER" (Missão 21) — nunca recomenda sem justificativa real. Duas
 * famílias de regra, ambas com motivo sempre exposto:
 *
 * 1) Evidência de diagnóstico — reaproveita `deriveDiagnosticSuggestions` (mesmo motor da Missão
 *    19), aplicada ao diagnóstico mais recente do veículo. Cobre os exemplos "Hidratação (couro
 *    ressecado)" e "Vidros (contaminação na última inspeção)" literalmente como no negócio pediu.
 *
 * 2) Recorrência — a Missão 21 também ilustra "Motor (mais de 6 meses)" e "Sanitização (4 meses)",
 *    que dependem de saber há quanto tempo o serviço foi feito, não de um achado de diagnóstico.
 *    "Sanitização" não existe no catálogo real (o nome real é "Higienização Interna", ver
 *    `src/db/seed/recipe-engine-services.ts`) — usamos o nome real. Os limiares de dias são
 *    decisão desta sprint (documentados abaixo), não uma regra recebida do negócio, e só disparam
 *    quando o serviço já foi comprado alguma vez (nunca sugerimos "primeira vez" por recorrência).
 */
const RECURRING_SERVICE_THRESHOLD_DAYS: Record<string, number> = {
  "Lavagem de Motor": 180, // ~6 meses — exemplo literal da Missão 21 ("Motor")
  "Higienização Interna": 120, // ~4 meses — exemplo literal da Missão 21 ("Sanitização")
  "Cristalização de Vidros": 180, // decisão desta sprint (sem regra de vencimento definida, ver protections.ts)
  Vitrificação: 365, // decisão desta sprint
};

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** `timeline` já filtrada para um único veículo, mais recente primeiro. */
export function buildSmartRecommendations(params: { latestDiagnostic: Diagnostic | null; timeline: CrmTimelineEntry[]; now?: Date }): SmartRecommendation[] {
  const now = params.now ?? new Date();
  const recommendations: SmartRecommendation[] = [];

  if (params.latestDiagnostic) {
    for (const suggestion of deriveDiagnosticSuggestions(params.latestDiagnostic)) {
      recommendations.push({ id: suggestion.id, label: recommendationCategoryLabel(suggestion.id), reason: suggestion.reason });
    }
  }

  for (const [serviceName, thresholdDays] of Object.entries(RECURRING_SERVICE_THRESHOLD_DAYS)) {
    const lastEntry = params.timeline.find((e) => e.services.includes(serviceName));
    if (!lastEntry) continue;
    const daysSince = Math.floor((now.getTime() - Date.parse(lastEntry.dateIso)) / 86_400_000);
    if (daysSince >= thresholdDays) {
      recommendations.push({
        id: `recorrencia_${slug(serviceName)}`,
        label: serviceName,
        reason: `Já se passaram ${daysSince} dias desde a última ${serviceName.toLowerCase()} (${formatDateBR(saoPauloDateISO(new Date(lastEntry.dateIso)))}).`,
      });
    }
  }

  return recommendations;
}
