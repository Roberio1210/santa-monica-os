import type { StrategicMemoryItemKind } from "@/lib/zezinho/directors/organizationalMemory/types";
import type { DirectorReport } from "@/lib/zezinho/directors/types";

/**
 * Memória Estratégica (Sprint 5.0, Z3B, decisão do usuário) — metas/projetos/objetivos, nunca
 * expira. Hoje só extrai `kind: "meta"`: a única fonte real disponível é o Fact `goal_progress`
 * (metas de faturamento reais, `db/schema/goals.ts`). "Projeto" e "objetivo" existem no tipo
 * (`organizationalMemory/types.ts`) mas nunca são populados aqui — sem um módulo real de
 * projetos/OKRs, seria inventar dado.
 */

export interface StrategicCandidate {
  kind: StrategicMemoryItemKind;
  title: string;
  description: string;
  evidenceFactKeys: string[];
}

function extractGoalTitle(statement: string): string {
  const match = statement.match(/Meta "([^"]+)"/);
  return match ? match[1] : statement;
}

export function deriveStrategicCandidates(reports: DirectorReport[]): StrategicCandidate[] {
  const candidates: StrategicCandidate[] = [];
  for (const report of reports) {
    const fact = report.facts.find((f) => f.key === "goal_progress");
    if (!fact) continue;
    candidates.push({ kind: "meta", title: extractGoalTitle(fact.statement), description: fact.statement, evidenceFactKeys: ["goal_progress"] });
  }
  return candidates;
}
