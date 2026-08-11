import { NextResponse } from "next/server";
import { runHistoricalBackfill } from "@/lib/integrations/jumppark/backfill";
import { processAutomaticConsumption, AUTOMATIC_CONSUMPTION_ACTIVATED_AT } from "@/lib/jumppark-orders/automatic-consumption";
import { getInventoryConsumptionMode } from "@/lib/config/env";
import { saoPauloDateISO, addDaysIso, isValidIsoDate } from "@/lib/utils/timezone";

/**
 * Endpoint de sincronização/backfill JumpPark → Neon (Missão 27) — protegido por `CRON_SECRET`
 * (não pelo Basic Auth do `middleware.ts`, ver PUBLIC_PATHS lá: este caminho tem autenticação
 * própria, então fica isento do gate geral). Dois usos:
 *
 * 1. Cron diário da Vercel (`vercel.json`) — chamado sem parâmetros, sincroniza uma janela
 *    retroativa pequena (`days`, padrão 5) para capturar alterações tardias em ordens recentes.
 *    A Vercel injeta automaticamente `Authorization: Bearer $CRON_SECRET` quando a env var se
 *    chama exatamente `CRON_SECRET` — não é preciso configurar nada além dela.
 * 2. Backfill histórico manual — chamado com `overallStart`/`overallEnd` explícitos (e
 *    opcionalmente `batchDays`/`maxDurationMs`/`maxBatches`) para importar um intervalo grande em
 *    lotes seguros. Idempotente e resumível: chamar de novo continua de onde parou
 *    (`runHistoricalBackfill`, Missão 27).
 *
 * Nunca lança — toda falha de lote já vira `status: "error"` dentro do resultado.
 *
 * Missão de Automação JumpPark → Consumo — quando `INVENTORY_CONSUMPTION_MODE=automatic`, ao
 * final da sincronização processa consumo automático (`processAutomaticConsumption`) para o
 * mesmo intervalo sincronizado, nunca antes de `AUTOMATIC_CONSUMPTION_ACTIVATED_AT` (sem
 * backfill retroativo). Falha no consumo automático nunca derruba a resposta da sincronização.
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

  const overallStartParam = url.searchParams.get("overallStart");
  const overallEndParam = url.searchParams.get("overallEnd");

  let overallStart: string;
  let overallEnd: string;

  if (overallStartParam || overallEndParam) {
    if (!isValidIsoDate(overallStartParam) || !isValidIsoDate(overallEndParam)) {
      return NextResponse.json({ error: "overallStart e overallEnd devem ser datas válidas (YYYY-MM-DD) e vir juntos." }, { status: 400 });
    }
    overallStart = overallStartParam;
    overallEnd = overallEndParam;
  } else {
    const daysParam = Number.parseInt(url.searchParams.get("days") ?? "", 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 5;
    overallStart = addDaysIso(today, -days);
    overallEnd = today;
  }

  const batchDaysParam = Number.parseInt(url.searchParams.get("batchDays") ?? "", 10);
  const maxDurationMsParam = Number.parseInt(url.searchParams.get("maxDurationMs") ?? "", 10);
  const maxBatchesParam = Number.parseInt(url.searchParams.get("maxBatches") ?? "", 10);

  const result = await runHistoricalBackfill({
    overallStart,
    overallEnd,
    batchDays: Number.isFinite(batchDaysParam) && batchDaysParam > 0 ? batchDaysParam : undefined,
    maxDurationMs: Number.isFinite(maxDurationMsParam) && maxDurationMsParam > 0 ? maxDurationMsParam : undefined,
    maxBatchesPerRun: Number.isFinite(maxBatchesParam) && maxBatchesParam > 0 ? maxBatchesParam : undefined,
  });

  let automaticConsumption = null;
  if (getInventoryConsumptionMode() === "automatic" && overallEnd >= AUTOMATIC_CONSUMPTION_ACTIVATED_AT) {
    // Nunca avalia data anterior à ativação (seção 13 — sem backfill retroativo), mesmo que a
    // sincronização em si cubra uma janela mais antiga (ex.: cron diário retroativo de 5 dias).
    const consumptionStart = overallStart < AUTOMATIC_CONSUMPTION_ACTIVATED_AT ? AUTOMATIC_CONSUMPTION_ACTIVATED_AT : overallStart;
    try {
      automaticConsumption = await processAutomaticConsumption(consumptionStart, overallEnd);
    } catch (err) {
      // Consumo automático nunca derruba a sincronização — mesma garantia de resiliência do resto desta rota.
      automaticConsumption = { error: err instanceof Error ? err.message : "Falha desconhecida no consumo automático." };
    }
  }

  return NextResponse.json({ ...result, automaticConsumption });
}
