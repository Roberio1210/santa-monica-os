import type { MovementType } from "@/lib/inventory/types";

/**
 * Constantes puras de "Saídas" (Missão 22) — separadas de manual-exit.ts (que importa o
 * repositório e, por tabela, o driver do Postgres) para que componentes client-side possam
 * importar só isso, sem puxar código server-only para o bundle do navegador. Mesmo padrão de
 * manual-movement-types.ts.
 */
export const EXIT_REASONS = ["consumo", "perda", "descarte", "teste", "outros"] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  consumo: "Consumo",
  perda: "Perda",
  descarte: "Descarte",
  teste: "Teste",
  outros: "Outros",
};

/**
 * Cada motivo mapeia para um tipo que já existe no livro-razão sempre que possível
 * (consumo→consumo_interno, perda→perda, teste→consumo_teste_calibracao) — só "descarte" e
 * "outros" (Missão 22) não tinham tipo correspondente e foram adicionados ao enum. Nunca inventa
 * um tipo novo quando um já serve.
 */
export const EXIT_REASON_TO_MOVEMENT_TYPE: Record<ExitReason, MovementType> = {
  consumo: "consumo_interno",
  perda: "perda",
  descarte: "descarte",
  teste: "consumo_teste_calibracao",
  outros: "outros",
};
