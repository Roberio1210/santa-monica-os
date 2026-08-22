import { z } from "zod";
import { isValidIsoDate, resolvePeriod, type PeriodKey, type PeriodRange } from "@/lib/utils/timezone";

/**
 * Traduz o período em linguagem natural que o modelo generativo decide pedir (Missão Z2) para o
 * mesmo `PeriodRange` que o pipeline determinístico (Z3/Z4) já usa — nunca um cálculo de data
 * novo: sempre `resolvePeriod` (já existente, `lib/utils/timezone.ts`), a mesma fonte usada por
 * `service.ts`/`comparison-engine.ts`. O modelo nunca calcula datas sozinho.
 */
const NAMED_PERIODS: PeriodKey[] = ["today", "yesterday", "last7days", "week", "previous_week", "month", "previous_month", "last30days", "last90days", "year"];

export const periodInputSchema = z
  .object({
    periodo: z
      .enum(NAMED_PERIODS as [PeriodKey, ...PeriodKey[]])
      .optional()
      .describe("Período nomeado — use quando o usuário falar em termos relativos (hoje, ontem, esta semana, este mês, etc.)."),
    data_inicio: z.string().optional().describe("Data inicial no formato YYYY-MM-DD — só quando o usuário citar datas específicas."),
    data_fim: z.string().optional().describe("Data final no formato YYYY-MM-DD — só quando o usuário citar datas específicas."),
  })
  .describe("Período de referência para a consulta. Omitir tudo quando a pergunta não depender de período (o padrão vira 'hoje').");

export type PeriodInput = z.infer<typeof periodInputSchema>;

/** Nunca lança — entrada inválida ou ausente sempre cai em "hoje" (mesmo padrão honesto de `resolvePeriod`). */
export function resolvePeriodInput(input: PeriodInput | undefined): PeriodRange {
  if (!input) return resolvePeriod("today");
  if (input.data_inicio && input.data_fim && isValidIsoDate(input.data_inicio) && isValidIsoDate(input.data_fim)) {
    return resolvePeriod("custom", { from: input.data_inicio, to: input.data_fim });
  }
  if (input.periodo) return resolvePeriod(input.periodo);
  return resolvePeriod("today");
}
