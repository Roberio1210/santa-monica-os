import type { MovementType } from "@/lib/inventory/types";

/**
 * Únicos tipos que um formulário manual pode registrar — separado de manual-movement.ts (que
 * importa o repositório e, por tabela, o driver do Postgres) para que componentes client-side
 * possam importar só a constante, sem puxar código server-only para o bundle do navegador.
 */
export const MANUAL_MOVEMENT_TYPES: MovementType[] = [
  "ajuste_positivo",
  "ajuste_negativo",
  "perda",
  "avaria",
  "vencimento",
  "devolucao",
  "transferencia",
  "correcao_inventario",
];
