import { DIRECTOR_REGISTRY } from "@/lib/zezinho/directors/registry";
import { runDirector } from "@/lib/zezinho/directors/runDirector";
import { deriveCorrelations, INTELLIGENCE_SCOPE_LIMITATION } from "@/lib/zezinho/directors/inteligencia";
import { consolidate } from "@/lib/zezinho/directors/estrategico";
import type { ConsolidatedReport, DirectorId } from "@/lib/zezinho/directors/types";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import { EMPTY_REASONING_SESSION, type ReasoningSession } from "@/lib/zezinho/memory/types";

/**
 * Orquestrador da Diretoria (Sprint 5.0, Z1) — roda os Diretores selecionados em paralelo (mesmo
 * padrão de `executeTools`/`Promise.all` desde a Sprint 4.0, nunca serial), cruza os relatórios
 * pelo Diretor de Inteligência e consolida pelo Diretor Estratégico. Este é o único ponto de
 * entrada da "Reunião de Diretoria" (seção 7.1 do documento de arquitetura) — o Executive
 * Briefing (Z4) e perguntas amplas do chat (Z4) vão chamar exatamente esta função.
 */

const EMPTY_ENTITIES: ExtractedEntities = { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null };

export const ALL_DIRECTOR_IDS: DirectorId[] = Object.keys(DIRECTOR_REGISTRY) as DirectorId[];

export async function runDiretoria(directorIds: DirectorId[] = ALL_DIRECTOR_IDS, entities: ExtractedEntities = EMPTY_ENTITIES, memory: ReasoningSession = EMPTY_REASONING_SESSION): Promise<ConsolidatedReport> {
  const uniqueIds = Array.from(new Set(directorIds));
  const reports = await Promise.all(uniqueIds.map((id) => runDirector(DIRECTOR_REGISTRY[id], entities, memory)));

  // O Diretor de Inteligência sempre declara o limite atual do seu alcance (seção "Honestidade
  // sobre o alcance atual" de inteligencia.ts) — nunca deixa implícito que já cruza tudo.
  const reportsWithHonestLimits = reports.map((r) => (r.director === "inteligencia" ? { ...r, limitations: Array.from(new Set([...r.limitations, INTELLIGENCE_SCOPE_LIMITATION])) } : r));

  const correlations = deriveCorrelations(reportsWithHonestLimits);
  return consolidate(reportsWithHonestLimits, correlations);
}
