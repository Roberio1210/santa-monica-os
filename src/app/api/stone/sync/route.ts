import { NextResponse } from "next/server";
import { syncStonePeriod } from "@/lib/integrations/stone/persistence/importRun";
import { saoPauloDateISO, addDaysIso, isValidIsoDate } from "@/lib/utils/timezone";

/**
 * Missão Financeiro V2 (Prioridade 1) — sincronização automática diária da Stone → Neon. Mesmo
 * padrão exato de `/api/jumppark/sync/route.ts`: protegido por `CRON_SECRET` (a Vercel injeta
 * `Authorization: Bearer $CRON_SECRET` automaticamente para o cron de `vercel.json`), isento do
 * Basic Auth geral (ver `PUBLIC_PATHS` em `middleware.ts`). Reaproveita `syncStonePeriod`
 * (Sprint 7.0, Z4) — nenhum importador novo: mesma idempotência por (`referenceDate`,`layout`)
 * já garantida em `stone_import_runs`/`stone_normalized_transactions`. Nunca lança — toda falha de
 * dia já vira `status: "failed"` dentro do resultado, sem derrubar a resposta.
 *
 * Janela padrão: os últimos `days` dias (padrão 5, mesmo valor do cron JumpPark) — cobre o atraso
 * real de publicação do arquivo Stone (até 29h, ver `docs/stone-integration-architecture.md`)
 * sem precisar ressincronizar tudo todo dia (arquivos de dias já fechados são idempotentes e
 * baratos de reprocessar, mas não há motivo para variar a janela sem necessidade real).
 */
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const today = saoPauloDateISO();

  const fromParam = url.searchParams.get("fromDate");
  const toParam = url.searchParams.get("toDate");

  let fromDate: string;
  let toDate: string;

  if (fromParam || toParam) {
    if (!isValidIsoDate(fromParam) || !isValidIsoDate(toParam)) {
      return NextResponse.json({ error: "fromDate e toDate devem ser datas válidas (YYYY-MM-DD) e vir juntos." }, { status: 400 });
    }
    fromDate = fromParam;
    toDate = toParam;
  } else {
    const daysParam = Number.parseInt(url.searchParams.get("days") ?? "", 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 5;
    fromDate = addDaysIso(today, -days);
    toDate = today;
  }

  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate não pode ser depois de toDate." }, { status: 400 });
  }

  const result = await syncStonePeriod({ fromDate, toDate, origin: "cron" });
  return NextResponse.json(result);
}
