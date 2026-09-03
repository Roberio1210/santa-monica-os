import Link from "next/link";
import { ArrowRight, FileMinus, Landmark, Receipt, Tags, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { APP_MODULES } from "@/components/navigation/app-modules";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardTitle } from "@/components/ui/card";
import { VisaoGeralPanel } from "@/components/finance/visao-geral-panel";
import { OperationPanel } from "@/components/finance/operation-panel";
import { FinancePeriodSelector } from "@/components/finance/finance-period-selector";
import { FINANCE_TABS, financeTabHref, resolveFinanceTab, type FinanceTab } from "@/lib/finance/financeTabs";
import { resolveFinancePeriod, type FinancePeriodParams } from "@/lib/finance/financePeriod";
import DrePage from "@/app/financeiro/dre/page";
import FluxoDeCaixaPage from "@/app/financeiro/fluxo-de-caixa/page";
import DespesasGerencialPage from "@/app/financeiro/despesas/page";
import FechamentoPage from "@/app/financeiro/fechamento/page";

// Consulta dados reais a cada acesso — a Central Financeira nunca deve servir HTML estático desatualizado.
export const dynamic = "force-dynamic";

function HubLink({ href, icon: Icon, title, description }: { href: string; icon: typeof Wallet; title: string; description: string }) {
  return (
    <Link href={href} className="block rounded-xl">
      <Card className="p-4 transition-colors hover:border-accent/50 hover:bg-background-elevated">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-foreground-subtle" aria-hidden="true" />
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
          <ArrowRight className="h-4 w-4 text-foreground-subtle" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xs text-foreground-muted">{description}</p>
      </Card>
    </Link>
  );
}

type FinanceSearchParams = { tab?: string } & FinancePeriodParams;

/**
 * Missão Financeiro 5B (Fase 1) — shell da Central Financeira. Cada aba REAPROVEITA a página
 * especializada já existente (importada e renderizada diretamente) — nenhum motor de cálculo
 * duplicado, nenhuma lógica financeira reescrita. As rotas especializadas (`/financeiro/dre`,
 * `/financeiro/fluxo-de-caixa`, etc.) continuam existindo e funcionando de forma independente.
 *
 * Missão Financeiro 5C (Fase 2) — o período global (`resolveFinancePeriod`) é resolvido uma vez
 * aqui e repassado para as abas que já sabem recebê-lo SEM duplicar motor: DRE e Despesas recebem
 * `from`/`to` nos mesmos nomes de sempre; Fluxo de Caixa recebe via seu próprio preset
 * "personalizado" (`periodo=personalizado&de=...&ate=...`) — nunca migramos seus query params
 * (decisão da Missão 5B, ainda vale). Contas, Stone e Fechamento continuam com semântica própria
 * (due date / competência única / hub de navegação) — o filtro global nunca força uma composição
 * artificial nelas (ver checkpoint, item "abas").
 */
export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const params = await searchParams;
  const activeTab = resolveFinanceTab(params.tab);
  const period = resolveFinancePeriod(params);
  const tabHref = (tab: FinanceTab | string) => financeTabHref(tab, period);

  return (
    <div className="space-y-6">
      <PageHeader title="Central Financeira" description="Visão financeira, fluxo de caixa, contas, despesas e resultados da operação." />

      <FinancePeriodSelector period={period} tab={activeTab} />

      <Tabs items={FINANCE_TABS} active={activeTab} hrefFor={tabHref} />

      {activeTab === "visao-geral" ? <VisaoGeralPanel period={period} /> : null}

      {activeTab === "lavacao" ? <OperationPanel group="estetica_automotiva" period={period} /> : null}

      {activeTab === "estacionamento" ? <OperationPanel group="estacionamento" period={period} /> : null}

      {activeTab === "dre" ? <DrePage searchParams={Promise.resolve({ from: period.from, to: period.to })} /> : null}

      {activeTab === "fluxo" ? <FluxoDeCaixaPage searchParams={Promise.resolve({ periodo: "personalizado", de: period.from, ate: period.to })} /> : null}

      {activeTab === "contas" ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">
            As páginas completas de Contas a Receber e Contas a Pagar continuam com CRUD, filtros e alertas próprios (por vencimento, não pelo período global acima) — os atalhos abaixo levam
            direto a cada uma.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HubLink href="/financeiro/contas-a-receber" icon={Receipt} title="Contas a Receber" description="Lista completa, baixas, vencimentos e alertas de recebíveis." />
            <HubLink href="/financeiro/contas-a-pagar" icon={FileMinus} title="Contas a Pagar" description="Lista completa, baixas, vencimentos e alertas de obrigações." />
          </div>
        </div>
      ) : null}

      {activeTab === "despesas" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/financeiro/classificacao"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent/40 hover:text-foreground"
            >
              <Tags className="h-3.5 w-3.5" />
              Classificação Financeira
            </Link>
            <Link
              href="/financeiro/fornecedores"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent/40 hover:text-foreground"
            >
              <Landmark className="h-3.5 w-3.5" />
              Fornecedores
            </Link>
          </div>
          <DespesasGerencialPage searchParams={Promise.resolve({ period: "custom", from: period.from, to: period.to })} />
        </div>
      ) : null}

      {activeTab === "stone" ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">
            Conciliação e Extrato são fontes diferentes — conciliação é a liquidação de vendas via adquirente; extrato é a conta bancária Stone. Nunca são a mesma coisa.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HubLink href="/financeiro/stone-conciliacao" icon={Landmark} title="Conciliação Stone" description="Vendas, taxas, antecipações e chargebacks processados via arquivo diário." />
            <HubLink href="/financeiro/conta-stone" icon={Wallet} title="Conta Stone (extrato)" description="Extrato bancário real da conta Stone: saldo, Pix, importação e classificação." />
          </div>
        </div>
      ) : null}

      {activeTab === "fechamento" ? <FechamentoPage searchParams={Promise.resolve({})} /> : null}

      <div className="border-t border-border-subtle pt-4">
        <p className="mb-2 text-xs font-medium text-foreground-muted">Todos os módulos financeiros</p>
        <div className="flex flex-wrap gap-2">
          {APP_MODULES.find((m) => m.id === "financeiro")!.shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-foreground-subtle transition-colors hover:border-accent/40 hover:text-foreground"
              >
                <Icon className="h-3 w-3" />
                {shortcut.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
