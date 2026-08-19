import { Badge, type BadgeProps } from "@/components/ui/badge";
import { itemClassificationLabels, type ItemClassification } from "@/lib/inventory/types";

/**
 * Missão Financeiro V5.2 — única fonte de verdade da cor/variante do badge de classificação,
 * reutilizada em toda a aplicação (lista e detalhe de produtos) para nunca espalhar if/else de
 * cor por componente. "warning" (âmbar) para reutilizáveis é deliberado: chama atenção de que o
 * item NÃO se comporta como consumível, sem inventar um novo variant no design system.
 */
const CLASSIFICATION_BADGE_VARIANT: Record<ItemClassification, BadgeProps["variant"]> = {
  quimico_volume: "info",
  solido_peso: "info",
  consumivel_unidade: "info",
  epi: "info",
  ferramenta: "warning",
  equipamento: "warning",
  patrimonio: "outline",
  manutencao: "info",
  material_divulgacao: "info",
  brinde_cliente: "info",
  nao_controlado: "outline",
};

export function ClassificationBadge({ classification }: { classification: ItemClassification | null }) {
  if (classification === null) {
    return <Badge variant="outline">Não classificado</Badge>;
  }
  return <Badge variant={CLASSIFICATION_BADGE_VARIANT[classification]}>{itemClassificationLabels[classification]}</Badge>;
}
