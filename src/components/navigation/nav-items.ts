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
  FileMinus,
  BookOpen,
  FileBarChart,
  Tags,
  Lock,
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
  { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: BookOpen },
  { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: Receipt },
  { href: "/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: FileMinus },
  { href: "/financeiro/dre", label: "DRE Gerencial", icon: FileBarChart },
  { href: "/financeiro/classificacao", label: "Classificação Financeira", icon: Tags },
  { href: "/financeiro/fechamento", label: "Fechamento", icon: Lock },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/seguranca", label: "Segurança", icon: ShieldCheck },
  { href: "/zezinho", label: "Zézinho IA", icon: Bot },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
