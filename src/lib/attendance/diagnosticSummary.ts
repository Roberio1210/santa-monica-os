import { CONDITION_LABELS, DIAGNOSTIC_AREAS, DIAGNOSTIC_AREA_LABELS, ENGINE_CONDITION_LABELS, type Diagnostic, type DiagnosticArea } from "@/lib/attendance/types";

const ISSUE_LEVEL_TEXT: Record<string, string> = { leve: "leve", media: "média", alta: "alta" };

const INTERIOR_LABELS: Record<string, string> = {
  plasticos: "Plásticos",
  couro: "Couro",
  tecidos: "Tecidos",
  tapetes: "Tapetes",
  teto: "Teto",
  portaMalas: "Porta-malas",
  vidrosInternos: "Vidros internos",
  odor: "Odor",
  pelosAnimais: "Pelos de animais",
  areia: "Areia",
};

/** `null` quando a área não tem nada a mostrar (nunca renderiza uma linha vazia). Compartilhado entre o Detalhe da Ordem e o Planejamento Operacional. */
export function describeDiagnosticArea(diagnostic: Diagnostic, area: DiagnosticArea): string | null {
  switch (area) {
    case "pintura": {
      const { chuvaAcida, riscos, hologramas, manchas } = diagnostic.pintura;
      const parts: string[] = [];
      if (chuvaAcida !== "nenhuma") parts.push(`Chuva ácida (${ISSUE_LEVEL_TEXT[chuvaAcida]})`);
      if (riscos !== "nenhuma") parts.push(`Riscos (${ISSUE_LEVEL_TEXT[riscos]})`);
      if (hologramas !== "nenhuma") parts.push(`Hologramas (${ISSUE_LEVEL_TEXT[hologramas]})`);
      if (manchas !== "nenhuma") parts.push(`Manchas (${ISSUE_LEVEL_TEXT[manchas]})`);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "rodas": {
      const { sujeiraPesada, contaminacao, oxidacao, freioImpregnado } = diagnostic.rodas;
      const parts: string[] = [];
      if (sujeiraPesada) parts.push("Sujeira pesada");
      if (contaminacao) parts.push("Contaminação");
      if (oxidacao) parts.push("Oxidação");
      if (freioImpregnado) parts.push("Freio impregnado");
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "pneus":
      return diagnostic.pneus.condition ? CONDITION_LABELS[diagnostic.pneus.condition] : null;
    case "vidros": {
      const { contaminacao, marcasDagua, cristalizacaoExistente } = diagnostic.vidros;
      const parts: string[] = [];
      if (contaminacao) parts.push("Contaminação");
      if (marcasDagua) parts.push("Marcas d'água");
      if (cristalizacaoExistente) parts.push("Cristalização existente");
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "motor":
      return diagnostic.motor.condition ? ENGINE_CONDITION_LABELS[diagnostic.motor.condition] : null;
    case "interior": {
      const parts = Object.entries(diagnostic.interior)
        .filter(([, marked]) => marked)
        .map(([key]) => INTERIOR_LABELS[key]);
      return parts.length > 0 ? parts.join(", ") : null;
    }
  }
}

/** Lista "Área: descrição" para cada área com achado real — nunca inclui área sem achado. */
export function summarizeDiagnosticIssues(diagnostic: Diagnostic): string[] {
  return DIAGNOSTIC_AREAS.map((area) => {
    const text = describeDiagnosticArea(diagnostic, area);
    return text ? `${DIAGNOSTIC_AREA_LABELS[area]}: ${text}` : null;
  }).filter((line): line is string => line !== null);
}
