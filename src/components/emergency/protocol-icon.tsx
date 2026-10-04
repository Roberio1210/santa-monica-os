import { BellRing, CarFront, CircleAlert, Droplet, Flame, HeartPulse, PlugZap, ShieldX, TreePine, Waves, WifiOff, Zap, type LucideIcon } from "lucide-react";

/** Ícone de cada protocolo (apresentação, não conteúdo) — protocolo sem ícone mapeado usa o genérico. */
const PROTOCOL_ICONS: Record<string, LucideIcon> = {
  incendio: Flame,
  "dano-veiculo": CarFront,
  "roubo-furto": ShieldX,
  "acidente-pessoa": HeartPulse,
  alagamento: Waves,
  energia: Zap,
  "agua-vazamento": Droplet,
  internet: WifiOff,
  "alarme-seguranca": BellRing,
  "carregador-eletrico": PlugZap,
  "arvore-meio-ambiente": TreePine,
};

export function ProtocolIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = PROTOCOL_ICONS[slug] ?? CircleAlert;
  return <Icon className={className} aria-hidden />;
}
