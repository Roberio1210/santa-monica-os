import type { CrmTimelineEntry, ProtectionRecord } from "@/lib/crm-intelligente/types";

/**
 * "Proteções Ativas" (Missão 21) — o texto da missão ilustra o card com prazos de validade/
 * garantia ("Cristalização — Vence em: xx dias"; "Vitrificação — Garantia até: xx/xx/xxxx"). Isso
 * exigiria uma regra de negócio (quantos dias de garantia cada serviço oferece) que não existe em
 * nenhum lugar do sistema: não há campo de duração no catálogo (`services`, só `defaultPrice`) e
 * a decisão de deixar `VehicleProtection`/`activeProtections` sempre `[]` já foi tomada e
 * documentada duas vezes (`attendance/types.ts`, `attendance/history.ts`) exatamente por falta
 * dessa regra. A própria Missão 21 reforça, na mesma seção, "mostrar somente informações
 * existentes" e "nunca inventar".
 *
 * Resolução: mostramos aqui o fato real e comprovável — há quanto tempo cada serviço de proteção
 * foi executado pela última vez — nunca uma data de vencimento ou garantia inventada. Os serviços
 * considerados "proteção" são os do catálogo real que fazem esse papel (ver
 * `src/db/seed/recipe-engine-services.ts`).
 */
const PROTECTION_SERVICE_NAMES = ["Vitrificação", "Cristalização de Vidros", "Lavagem de Motor", "Higienização Interna"];

/** `timeline` já filtrada para um único veículo, mais recente primeiro (mesmo formato de `buildCrmTimeline`). */
export function buildActiveProtections(params: { timeline: CrmTimelineEntry[]; now?: Date }): ProtectionRecord[] {
  const now = params.now ?? new Date();
  const records: ProtectionRecord[] = [];

  for (const serviceName of PROTECTION_SERVICE_NAMES) {
    const entry = params.timeline.find((e) => e.services.includes(serviceName));
    if (!entry) continue;
    const daysSince = Math.floor((now.getTime() - Date.parse(entry.dateIso)) / 86_400_000);
    records.push({ serviceName, lastPerformedAt: entry.dateIso, daysSince });
  }

  return records;
}
