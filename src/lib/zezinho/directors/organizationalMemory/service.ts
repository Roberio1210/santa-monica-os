import "server-only";
import { getOrganizationalMemoryRepository } from "@/lib/zezinho/directors/organizationalMemory/repository-factory";
import { computeMemoryNote, summarizeDirectorForSnapshot } from "@/lib/zezinho/directors/organizationalMemory/snapshot";
import { candidateSignalsFromReport, deriveSignalKey, expiryDateFrom, nextStatus } from "@/lib/zezinho/directors/organizationalMemory/learnings";
import { deriveStrategicCandidates } from "@/lib/zezinho/directors/organizationalMemory/strategic";
import type { OrganizationalMemorySnapshot } from "@/lib/zezinho/directors/organizationalMemory/types";
import type { DirectorReport } from "@/lib/zezinho/directors/types";

/**
 * Único ponto de I/O da Memória Organizacional (Sprint 5.0, Z3B) — orquestra o repositório e a
 * lógica pura de `snapshot.ts`/`learnings.ts`/`strategic.ts` a cada execução da Diretoria
 * (`directors/diretoria.ts`). Nenhum Diretor individual (`runDirector.ts`) toca o banco — mesmo
 * princípio desde o Z1 ("quem busca dado é só o `OperationalContextBuilder`", aqui estendido para
 * "quem grava memória é só este serviço").
 */

const SNAPSHOT_HISTORY_DAYS = 30;
const RECENT_LEARNINGS_WINDOW_DAYS = 7;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoIso(now: Date, days: number): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function daysAgoDate(now: Date, days: number): string {
  return isoDate(new Date(daysAgoIso(now, days)));
}

const ORGANIZATIONAL_MEMORY_LIMITATIONS = [
  "Memória Estratégica hoje só rastreia metas de faturamento (goal_progress) — projetos e objetivos ainda não têm fonte real, nunca inventados.",
  "Crenças influenciam recomendações por sobreposição real de palavras-chave, nunca uma pontuação semântica ou de IA generativa.",
];

/**
 * Grava a leitura do dia (Memória Operacional), atualiza/promove o pipeline de aprendizado
 * (Memória Organizacional), atualiza a Memória Estratégica e devolve os `DirectorReport`s com
 * `memoryNote` preenchido + o retrato atual da Memória Organizacional (crenças ativas, itens
 * estratégicos, aprendizados recentes) para o futuro narrador do Executive Briefing.
 */
export async function recordDiretoriaRun(reports: DirectorReport[], now: Date = new Date()): Promise<{ reports: DirectorReport[]; organizationalMemory: OrganizationalMemorySnapshot }> {
  const repo = getOrganizationalMemoryRepository();
  const nowIso = now.toISOString();
  const today = isoDate(now);

  const patchedReports: DirectorReport[] = [];
  for (const report of reports) {
    const candidate = summarizeDirectorForSnapshot(report);
    let memoryNote: string | null = null;
    if (candidate) {
      await repo.upsertSnapshot({ directorId: report.director, snapshotDate: today, summary: candidate.summary, metricKey: candidate.metricKey, direction: candidate.direction, evidenceFactKeys: candidate.evidenceFactKeys });
      const history = await repo.getRecentSnapshots(report.director, daysAgoDate(now, SNAPSHOT_HISTORY_DAYS));
      memoryNote = computeMemoryNote(history);
    }

    for (const signal of candidateSignalsFromReport(report)) {
      const signalKey = deriveSignalKey(signal.description);
      const existing = await repo.findLearningBySignal(report.director, signalKey);
      if (existing) {
        const confirmationCount = existing.confirmationCount + 1;
        const status = nextStatus(existing.status, confirmationCount, existing.firstObservedAt, nowIso);
        const expiresAt = status === "observacao" ? expiryDateFrom(nowIso) : null;
        await repo.reinforceLearning(existing.id, { confirmedAt: nowIso, status, expiresAt, confidenceLevel: signal.confidenceLevel, limitations: signal.limitations });
      } else {
        await repo.createLearning({
          directorId: report.director,
          signalKey,
          description: signal.description,
          evidenceFactKeys: signal.evidenceFactKeys,
          confidenceLevel: signal.confidenceLevel,
          limitations: signal.limitations,
          observedAt: nowIso,
          expiresAt: expiryDateFrom(nowIso),
        });
      }
    }

    patchedReports.push({ ...report, memoryNote });
  }

  const expiredObservationsCount = await repo.expireStaleObservations(nowIso);

  for (const candidate of deriveStrategicCandidates(reports)) {
    await repo.upsertStrategicItem({ kind: candidate.kind, title: candidate.title, description: candidate.description, evidenceFactKeys: candidate.evidenceFactKeys, observedAt: nowIso });
  }

  const [activeBeliefs, strategicItems, recentLearnings] = await Promise.all([
    repo.listActiveBeliefs(),
    repo.listActiveStrategicItems(),
    repo.listRecentLearnings(daysAgoIso(now, RECENT_LEARNINGS_WINDOW_DAYS)),
  ]);

  return {
    reports: patchedReports,
    organizationalMemory: { recentLearnings, activeBeliefs, strategicItems, expiredObservationsCount, limitations: ORGANIZATIONAL_MEMORY_LIMITATIONS },
  };
}
