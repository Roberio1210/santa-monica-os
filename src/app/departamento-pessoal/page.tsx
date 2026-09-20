import Link from "next/link";
import { Users, Wallet, TrendingUp, Gift, CalendarClock, HandCoins, Landmark, MoreHorizontal, Heart } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StatCard } from "@/components/cards/stat-card";
import { getDpOverview } from "@/lib/hr/service";
import { CATEGORY_LABELS, outrosTotal } from "@/lib/hr/costSummary";
import { parsePeriodParams } from "@/lib/utils/timezone";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { getCurrentUser } from "@/lib/auth/session";
import { NewCollaboratorForm } from "@/components/hr/new-collaborator-form";

// Missão 86 — consulta dados reais a cada acesso, mesmo padrão de /visao-geral e /painel-gerencial.
export const dynamic = "force-dynamic";

export default async function DepartamentoPessoalPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const overview = await getDpOverview({ from: period.from, to: period.to });

  const totalPago = overview.recentPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Só controla se o botão aparece — a segurança de verdade é o requireAdmin (fail-closed) dentro
  // das próprias server actions createEmployeeAction/createContractorAction.
  const currentUser = await getCurrentUser();
  const canEdit = currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Departamento Pessoal" description="Folha, diárias, adiantamentos e encargos — sempre com vínculo rastreável ao financeiro real." />

      <NewCollaboratorForm canEdit={canEdit} />

      <div className="flex flex-col gap-2">
        <PeriodSelector period={period} />
        <p className="text-sm text-foreground-muted">{period.label}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Colaboradores ativos" icon={Users} value={String(overview.employeeCount + overview.contractorCount)} hint={`${overview.employeeCount} CLT · ${overview.contractorCount} PJ`} />
        <StatCard label="Custo total de pessoal no período" icon={Wallet} value={formatCurrency(overview.costSummary.totalGeral)} hint="Soma de todas as categorias abaixo — nunca um único 'salário'" />
        <StatCard label="Salários/fixos" icon={Users} value={formatCurrency(overview.costSummary.porCategoria.salario_fixo)} />
        <StatCard label="Comissões" icon={TrendingUp} value={formatCurrency(overview.costSummary.porCategoria.comissao)} />
        <StatCard label="Bônus" icon={Gift} value={formatCurrency(overview.costSummary.porCategoria.bonus)} />
        <StatCard label="Diárias/freelas" icon={CalendarClock} value={formatCurrency(overview.costSummary.porCategoria.diaria_freelancer)} />
        <StatCard label="Adiantamentos" icon={HandCoins} value={formatCurrency(overview.costSummary.porCategoria.adiantamento)} hint={`${overview.openAdvances.length} em aberto`} />
        <StatCard label="Benefícios/auxílios" icon={Heart} value={formatCurrency(overview.costSummary.porCategoria.beneficio_auxilio)} hint="Transporte, lanche/alimentação — nunca somado a salário/fixo" />
        <StatCard label="Encargos/impostos" icon={Landmark} value={formatCurrency(overview.costSummary.porCategoria.encargo)} />
        <StatCard label="Outros pagamentos" icon={MoreHorizontal} value={formatCurrency(outrosTotal(overview.costSummary.porCategoria))} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Colaboradores</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {overview.collaborators.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum colaborador cadastrado ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                    <th className="px-3 py-2 text-left font-medium">Vínculo</th>
                    <th className="px-3 py-2 text-left font-medium">Função/escopo</th>
                    <th className="px-3 py-2 text-left font-medium">Início</th>
                    <th className="px-3 py-2 text-left font-medium">Situação</th>
                    <th className="px-3 py-2 text-left font-medium">Total no período</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overview.collaborators.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2">
                        <Link href={`/departamento-pessoal/${c.id}`} className="font-medium text-accent hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{c.type === "employee" ? "CLT" : "PJ"}</td>
                      <td className="px-3 py-2">{c.role ?? <span className="italic text-foreground-subtle">Não informado</span>}</td>
                      <td className="px-3 py-2">{c.admissionOrStart ? formatDateBR(c.admissionOrStart) : <span className="italic text-foreground-subtle">Não informado</span>}</td>
                      <td className="px-3 py-2"><Badge variant={c.active ? "outline" : "critical"}>{c.active ? "Ativo" : "Desligado"}</Badge></td>
                      <td className="px-3 py-2">{formatCurrency(c.totalInPeriod)} <span className="text-xs text-foreground-subtle">({c.paymentCountInPeriod})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagamentos do período</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {overview.recentPayments.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum pagamento de pessoal registrado neste período.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Competência</th>
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overview.recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{formatDateBR(p.date)}</td>
                      <td className="px-3 py-2">{p.competenceDate ? formatDateBR(p.competenceDate) : <span className="italic text-foreground-subtle">= data do pagamento</span>}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{CATEGORY_LABELS[p.category] ?? p.category}</Badge></td>
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2">{formatCurrency(Number(p.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-foreground-subtle">Total exibido: {formatCurrency(totalPago)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adiantamentos em aberto</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {overview.openAdvances.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum adiantamento em aberto.</p>
          ) : (
            <ul className="space-y-2">
              {overview.openAdvances.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">{formatDateBR(a.date)} — {a.reason ?? "Adiantamento"}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={a.status === "aberto" ? "warning" : "info"}>{a.status === "aberto" ? "Aberto" : "Parcialmente compensado"}</Badge>
                    <span>{formatCurrency(Number(a.amount) - Number(a.compensatedAmount))} em aberto</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
