import { OBJECTIVE_DATA_AVAILABILITY, type BusinessObjective } from "@/lib/zezinho/objective/types";
import type { ToolResult } from "@/lib/zezinho/tools/types";
import type { Gap } from "@/lib/zezinho/reasoning/types";

/**
 * Lacunas (Etapa 4, quarta camada) — o que falta para responder com mais segurança. Nasce de
 * duas fontes: falhas reais de fonte (erro reportado por uma ferramenta) e objetivos que só têm
 * proxy disponível (`staffing_capacity`, sem módulo de equipe real — ver objective/types.ts).
 */
export function deriveGaps(toolResults: ToolResult[], objective: BusinessObjective | null): Gap[] {
  const gaps: Gap[] = [];

  for (const result of toolResults) {
    if (result.error) gaps.push({ description: result.error });
  }

  if (objective && OBJECTIVE_DATA_AVAILABILITY[objective] === "proxy_only") {
    gaps.push({ description: "Não tenho dado direto de equipe/agenda — a análise usa um indício operacional indireto (proxy), não uma medição real de produtividade." });
  }

  return gaps;
}
