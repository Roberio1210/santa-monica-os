import {
  LayoutDashboard,
  Wrench,
  Gauge,
  Droplets,
  ParkingSquare,
  CalendarDays,
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
  BellRing,
  Package,
  History,
  ClipboardCheck,
  FlaskConical,
  Beaker,
  Map,
  AlertCircle,
  SearchCheck,
  ShoppingBag,
  ListChecks,
  ArrowLeftRight,
  Landmark,
  Radio,
  Sparkles,
  CalendarClock,
  Contact,
  PackagePlus,
  PackageMinus,
  TrendingDown,
  Building2,
  FileText,
  GitMerge,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { isPathAllowedForRole } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/roles";

export interface ModuleShortcut {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Missão UX/Navegação 4B — agrupamento visual opcional dentro da página-hub do módulo (ex.:
   * Central de Operações separa seus 9 atalhos em "Operação"/"Gestão" em vez de uma fileira única
   * de botões idênticos). `undefined` = sem agrupamento (renderizado como lista simples, como nos
   * demais módulos desde a Missão 3).
   */
  group?: string;
}

export interface AppModule {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Rota de destino do item da lateral e raiz para o estado ativo do módulo. */
  href: string;
  /**
   * Missão UX/Navegação 3 — prefixos ADICIONAIS (além de `href`) considerados "dentro" deste
   * módulo, para o estado ativo da lateral. Necessário porque nem todo módulo tem uma única URL
   * raiz que prefixa todas as suas rotas (ex.: Central de Operações reúne /dashboard, /operacao,
   * /ordens, /movimentacoes... — rotas de topo distintas, nunca renomeadas nesta missão para não
   * quebrar links/bookmarks existentes).
   */
  matchPrefixes: string[];
  /**
   * Atalhos para as rotas que antes eram itens próprios da lateral (Missão UX/Navegação 1/3) —
   * usados nas páginas-hub de cada módulo para preservar acesso, e como fallback de link do
   * próprio módulo quando o papel do usuário não pode acessar `href` diretamente (ver
   * `resolveModuleLinkHref`). Nenhuma rota antiga foi removida — só deixou de ter item próprio.
   */
  shortcuts: ModuleShortcut[];
}

/**
 * Missão UX/Navegação 1/3 — fonte única da nova navegação principal (9 módulos), substituindo os
 * 48 itens antigos de `nav-items.ts` (mantido só como referência histórica/DEPRECATED, não é mais
 * importado por `sidebar.tsx`). Nenhuma rota antiga foi apagada ou renomeada — só reagrupada.
 */
export const APP_MODULES: AppModule[] = [
  {
    id: "central-operacoes",
    label: "Central de Operações",
    icon: LayoutDashboard,
    href: "/dashboard",
    matchPrefixes: ["/operacao", "/assistente-gerente", "/painel-gerencial", "/ordens", "/movimentacoes", "/lavacao", "/estacionamento", "/agenda", "/alertas"],
    // Missão UX/Navegação 4B — agrupado em "Operação" (o que está rodando agora) e "Gestão"
    // (análise/decisão), em vez da fileira única de 9 botões idênticos da Missão 3.
    shortcuts: [
      { href: "/operacao", label: "Operação ao Vivo", icon: Radio, group: "operacao" },
      { href: "/lavacao", label: "Lavação", icon: Droplets, group: "operacao" },
      { href: "/estacionamento", label: "Estacionamento", icon: ParkingSquare, group: "operacao" },
      { href: "/ordens", label: "Central de Ordens", icon: FileText, group: "operacao" },
      { href: "/movimentacoes", label: "Movimentações", icon: ClipboardList, group: "operacao" },
      { href: "/painel-gerencial", label: "Painel Gerencial", icon: Gauge, group: "gestao" },
      { href: "/assistente-gerente", label: "Assistente do Gerente", icon: Sparkles, group: "gestao" },
      { href: "/alertas", label: "Alertas", icon: BellRing, group: "gestao" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, group: "gestao" },
    ],
  },
  {
    id: "atendimento",
    label: "Atendimento",
    icon: Wrench,
    href: "/atendimento",
    matchPrefixes: [],
    shortcuts: [],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    icon: CalendarClock,
    href: "/planejamento",
    matchPrefixes: [],
    shortcuts: [{ href: "/planejamento/novo", label: "Novo agendamento", icon: CalendarClock }],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    href: "/financeiro",
    matchPrefixes: [],
    shortcuts: [
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: BookOpen },
      { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: Receipt },
      { href: "/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: FileMinus },
      { href: "/financeiro/despesas", label: "Despesas (gerencial)", icon: TrendingDown },
      { href: "/financeiro/fornecedores", label: "Fornecedores", icon: Building2 },
      { href: "/financeiro/dre", label: "DRE Gerencial", icon: FileBarChart },
      { href: "/financeiro/classificacao", label: "Classificação Financeira", icon: Tags },
      { href: "/financeiro/fechamento", label: "Fechamento", icon: Lock },
      { href: "/financeiro/stone-conciliacao", label: "Stone Conciliação", icon: Landmark },
      { href: "/financeiro/conta-stone", label: "Conta Stone (extrato)", icon: Wallet },
    ],
  },
  {
    id: "estoque",
    label: "Estoque",
    icon: Boxes,
    href: "/estoque",
    matchPrefixes: [],
    shortcuts: [
      { href: "/estoque/posicao", label: "Posição do Estoque", icon: Boxes },
      { href: "/estoque/produtos", label: "Produtos", icon: Package },
      { href: "/estoque/compras", label: "Produtos/Compras (gerencial)", icon: ShoppingCart },
      { href: "/estoque/entradas", label: "Entradas", icon: PackagePlus },
      { href: "/estoque/saidas", label: "Saídas", icon: PackageMinus },
      { href: "/estoque/movimentacoes", label: "Movimentações de Estoque", icon: History },
      { href: "/estoque/contagem", label: "Contagem física", icon: ClipboardCheck },
      { href: "/estoque/receitas", label: "Receitas", icon: FlaskConical },
      { href: "/estoque/calibracao", label: "Calibração", icon: Beaker },
      { href: "/estoque/mapeamentos", label: "Mapeamentos", icon: Map },
      { href: "/estoque/mapeamentos-servicos", label: "Mapeamentos de Serviços JumpPark", icon: GitMerge },
      { href: "/estoque/consumo-teorico-historico", label: "Consumo Teórico Histórico", icon: History },
      { href: "/estoque/ordens", label: "Ordens JumpPark", icon: ListChecks },
      { href: "/estoque/consumo-automatico", label: "Consumo Automático", icon: Zap },
      { href: "/estoque/consumos", label: "Consumos de Estoque", icon: ArrowLeftRight },
      { href: "/estoque/pendencias", label: "Pendências do Estoque", icon: AlertCircle },
      { href: "/estoque/compras-sugeridas", label: "Compras Sugeridas", icon: ShoppingBag },
      { href: "/estoque/auditoria", label: "Auditoria do Estoque", icon: SearchCheck },
      { href: "/compras", label: "Pesquisa de Preços (demo)", icon: ShoppingCart },
    ],
  },
  {
    id: "crm",
    label: "Clientes / CRM",
    icon: Contact,
    href: "/crm",
    matchPrefixes: [],
    shortcuts: [
      { href: "/crm/fidelizacao", label: "Fidelização", icon: Contact },
      { href: "/crm/sem-retorno", label: "Sem retorno", icon: Contact },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    href: "/marketing",
    matchPrefixes: [],
    shortcuts: [],
  },
  {
    id: "zezinho",
    label: "Zézinho IA",
    icon: Bot,
    href: "/zezinho",
    matchPrefixes: [],
    shortcuts: [],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    icon: Settings,
    href: "/configuracoes",
    matchPrefixes: ["/seguranca"],
    shortcuts: [
      { href: "/configuracoes/status", label: "Status das integrações", icon: Settings },
      { href: "/seguranca", label: "Segurança", icon: ShieldCheck },
    ],
  },
];

/** Módulo cuja rota (ou algum de seus prefixos/atalhos) contém `pathname` — usado pelo estado ativo da lateral. */
export function resolveActiveModuleId(pathname: string): string | null {
  for (const appModule of APP_MODULES) {
    if (pathname === appModule.href || pathname.startsWith(`${appModule.href}/`)) return appModule.id;
    if (appModule.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return appModule.id;
    if (appModule.shortcuts.some((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))) return appModule.id;
  }
  return null;
}

/**
 * Missão UX/Navegação 3 — link efetivo de um módulo na lateral, considerando o papel do usuário.
 * `null` = sem sessão individual (comportamento de hoje) ou ADMIN, sempre `href`. Quando o papel
 * não pode acessar `href` diretamente (ex.: OPERACIONAL e "/dashboard"), cai no primeiro atalho
 * que ele PODE acessar — nunca esconde um módulo inteiro só porque a raiz é restrita, preservando
 * exatamente a mesma superfície que `OPERATIONAL_ALLOWED_PREFIXES` já liberava antes desta missão.
 */
export function resolveModuleLinkHref(appModule: AppModule, role: UserRole | null): string | null {
  if (role === null || isPathAllowedForRole(role, appModule.href)) return appModule.href;
  const fallback = appModule.shortcuts.find((s) => isPathAllowedForRole(role, s.href));
  return fallback ? fallback.href : null;
}
