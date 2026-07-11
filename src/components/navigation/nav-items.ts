import {
  LayoutDashboard,
  Droplets,
  ParkingSquare,
  CalendarDays,
  Users,
  Wallet,
  Megaphone,
  Boxes,
  ShoppingCart,
  ShieldCheck,
  Bot,
  Settings,
  ClipboardList,
  Receipt,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/operacoes", label: "Movimentações", icon: ClipboardList },
  { href: "/lavacao", label: "Lavação", icon: Droplets },
  { href: "/estacionamento", label: "Estacionamento", icon: ParkingSquare },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: Receipt },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/seguranca", label: "Segurança", icon: ShieldCheck },
  { href: "/zezinho", label: "Zézinho IA", icon: Bot },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
