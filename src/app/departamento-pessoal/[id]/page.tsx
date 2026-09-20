import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wallet, TrendingUp, Gift, CalendarClock, HandCoins, Heart, Landmark, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StatCard } from "@/components/cards/stat-card";
import { getCollaboratorProfile } from "@/lib/hr/service";
import { CATEGORY_LABELS, outrosTotal } from "@/lib/hr/costSummary";
import { computeAdvanceOutstanding, type EmployeeAdvanceStatus } from "@/lib/hr/advances";
import { getCollaboratorEarningsSummary, getCollaboratorMonthlyEarnings } from "@/lib/hr/earnings";
import { EARNINGS_CATEGORIES, EARNINGS_CATEGORY_LABELS, type EarningsCategory } from "@/lib/hr/earningsCategories";
import { parsePeriodParams, saoPauloDateISO } from "@/lib/utils/timezone";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { getCurrentUser } from "@/lib/auth/session";
import { CollaboratorEditForm } from "@/components/hr/collaborator-edit-form";
import { CollaboratorPaymentForm } from "@/components/hr/collaborator-payment-form";
import { CollaboratorAdvanceForm } from "@/components/hr/collaborator-advance-form";
import { EarningsCategoryFilter } from "@/components/hr/earnings-category-filter";
import { listFinancialAccountOptions } from "@/lib/hr/repository";

// Ficha individual (Fase 1, 20/09/2026) — mesmo padrão de /departamento-pessoal: consulta dados
// reais a cada acesso, nunca cacheada (a folha muda a qualquer momento).
export const dynamic = "force-dynamic";

const ADVANCE_STATUS_LABEL: Record<EmployeeAdvanceStatus, string> = {
  aberto: "Aberto",
  parcialmente_compensado: "Parcialmente compensado",
  compensado: "Compensado",
};

const ADVANCE_STATUS_VARIANT: Record<EmployeeAdvanceStatus, "warning" | "info" | "positive"> = {
  aberto: "warning",
  parcialmente_compensado: "info",
  compensado: "positive",
};

function parseEarningsCategory(value: string | undefined): EarningsCategory | null {
  return (EARNINGS_CATEGORIES as readonly string[]).includes(value ?? "") ? (value as EarningsCategory) : null;
}

export default async function ColaboradorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string; month?: string; year?: string; category?: string }>;
}) {
  const { id } = await params;
  const searchParamsValue = await searchParams;
  const period = parsePeriodParams(searchParamsValue);
  const earningsCategory = parseEarningsCategory(searchParamsValue.category);
  const [profile, financialAccounts, earnings, monthlyEarnings] = await Promise.all([
    getCollaboratorProfile(id, { from: period.from, to: period.to }),
    listFinancialAccountOptions(),
    getCollaboratorEarningsSummary({ subjectId: id, from: period.from, to: period.to, category: earningsCategory ?? undefined }),
    getCollaboratorMonthlyEarnings(id, saoPauloDateISO()),
  ]);

  if (!profile) notFound();

  // Só controla se o BOTÃO aparece — a segurança de verdade é a checagem fail-closed dentro das
  // próprias server actions (requireAdmin, em departamento-pessoal/actions.ts), que roda de novo
  // mesmo que alguém chame a action diretamente sem passar por esta página.
  const currentUser = await getCurrentUser();
  const canEdit = currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile.name}
        description={`${profile.type === "employee" ? "CLT" : "PJ"} — ${profile.role ?? "função não informada"}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/departamento-pessoal" className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Voltar
            </Link>
            <Badge variant={profile.active ? "outline" : "critical"}>{profile.active ? "Ativo" : "Desligado"}</Badge>
          </div>
        }
      />

      <div className="flex flex-col gap-2">
        <PeriodSelector period={period} />
        <p className="text-sm text-foreground-muted">{period.label}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total no período" icon={Wallet} value={formatCurrency(profile.costSummary.totalGeral)} hint="Soma de todas as categorias abaixo — nunca um único 'salário'" />
        <StatCard label="Salários/fixos" icon={Wallet} value={formatCurrency(profile.costSummary.porCategoria.salario_fixo)} />
        <StatCard label="Comissões" icon={TrendingUp} value={formatCurrency(profile.costSummary.porCategoria.comissao)} />
        <StatCard label="Bônus/meta" icon={Gift} value={formatCurrency(profile.costSummary.porCategoria.bonus)} />
        <StatCard label="Diárias/freelas" icon={CalendarClock} value={formatCurrency(profile.costSummary.porCategoria.diaria_freelancer)} />
        <StatCard label="Benefícios/auxílios" icon={Heart} value={formatCurrency(profile.costSummary.porCategoria.beneficio_auxilio)} />
        <StatCard label="Adiantamentos" icon={HandCoins} value={formatCurrency(profile.costSummary.porCategoria.adiantamento)} />
        <StatCard label="Encargos/impostos" icon={Landmark} value={formatCurrency(profile.costSummary.porCategoria.encargo)} hint="Só aparece aqui quando o encargo está vinculado diretamente a esta pessoa" />
        <StatCard label="Outros pagamentos" icon={MoreHorizontal} value={formatCurrency(outrosTotal(profile.costSummary.porCategoria))} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Resumo de Ganhos</CardTitle>
          <EarningsCategoryFilter category={earningsCategory} />
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de pagamentos" icon={Wallet} value={formatCurrency(earnings.paymentsTotal)} hint="Soma dos 5 baldes abaixo — nunca inclui adiantamentos" />
            <StatCard label="Salário/fixo" icon={Wallet} value={formatCurrency(earnings.salaryTotal)} />
            <StatCard label="Comissão" icon={TrendingUp} value={formatCurrency(earnings.commissionTotal)} />
            <StatCard label="Meta/bônus" icon={Gift} value={formatCurrency(earnings.bonusOrGoalTotal)} />
            <StatCard label="Benefícios/auxílios" icon={Heart} value={formatCurrency(earnings.benefitsTotal)} />
            <StatCard label="Outros" icon={MoreHorizontal} value={formatCurrency(earnings.otherTotal)} />
            <StatCard label="Adiantamentos" icon={HandCoins} value={formatCurrency(earnings.advancesTotal)} hint="Sempre separado — nunca somado ao total de pagamentos" />
            <StatCard label="Total de saídas" icon={Landmark} value={formatCurrency(earnings.outflowTotal)} hint="Pagamentos + adiantamentos — métrica distinta, não confundir com 'Total de pagamentos'" />
          </div>

          {earnings.items.length === 0 ? (
            <EmptyState title="Nenhum lançamento neste período/categoria" description="Troque o período ou a categoria acima para ver o histórico completo." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium">Valor</th>
                    <th className="px-3 py-2 text-left font-medium">Competência</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {earnings.items.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td className="px-3 py-2">{formatDateBR(item.date)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={item.kind === "adiantamento" ? "warning" : "outline"}>{item.kind === "adiantamento" ? "Adiantamento" : "Pagamento"}</Badge>
                      </td>
                      <td className="px-3 py-2">{EARNINGS_CATEGORY_LABELS[item.category]}</td>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2">{formatCurrency(item.amount)}</td>
                      <td className="px-3 py-2">{item.competenceDate ? formatDateBR(item.competenceDate) : <span className="italic text-foreground-subtle">—</span>}</td>
                      <td className="px-3 py-2">{item.status ? ADVANCE_STATUS_LABEL[item.status as EmployeeAdvanceStatus] : <span className="italic text-foreground-subtle">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground">Histórico mensal</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Mês</th>
                    <th className="px-3 py-2 text-left font-medium">Pagamentos</th>
                    <th className="px-3 py-2 text-left font-medium">Adiantamentos</th>
                    <th className="px-3 py-2 text-left font-medium">Total de saídas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthlyEarnings.map((m) => (
                    <tr key={m.monthKey}>
                      <td className="px-3 py-2">{m.label}</td>
                      <td className="px-3 py-2">{formatCurrency(m.paymentsTotal)}</td>
                      <td className="px-3 py-2">{formatCurrency(m.advancesTotal)}</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(m.outflowTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-foreground-muted">Nome</dt>
              <dd className="font-medium text-foreground">{profile.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Vínculo</dt>
              <dd>{profile.type === "employee" ? "CLT" : "PJ"}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">CPF/CNPJ</dt>
              <dd>{profile.type === "employee" ? <span className="italic text-foreground-subtle">Não aplicável (CLT)</span> : (profile.taxId ?? <span className="italic text-foreground-subtle">Não informado</span>)}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Função/escopo</dt>
              <dd>{profile.role ?? <span className="italic text-foreground-subtle">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Data de admissão/início</dt>
              <dd>{profile.admissionOrStart ? formatDateBR(profile.admissionOrStart) : <span className="italic text-foreground-subtle">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Jornada</dt>
              <dd>{profile.type === "contractor" ? <span className="italic text-foreground-subtle">Não aplicável (PJ)</span> : (profile.workSchedule ?? <span className="italic text-foreground-subtle">Não informado</span>)}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Valor combinado</dt>
              <dd>{profile.agreedValueOrBaseSalary !== null ? formatCurrency(profile.agreedValueOrBaseSalary) : <span className="italic text-foreground-subtle">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Status</dt>
              <dd><Badge variant={profile.active ? "outline" : "critical"}>{profile.active ? "Ativo" : "Desligado"}</Badge></dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <CollaboratorEditForm profile={profile} canEdit={canEdit} />

      <CollaboratorPaymentForm profile={profile} financialAccounts={financialAccounts} canEdit={canEdit} />

      <CollaboratorAdvanceForm profile={profile} financialAccounts={financialAccounts} canEdit={canEdit} />

      <Card>
        <CardHeader>
          <CardTitle>Histórico de pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {profile.payments.length === 0 ? (
            <EmptyState title="Nenhum pagamento neste período" description="Troque o período acima para ver o histórico completo deste colaborador." />
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
                  {profile.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{formatDateBR(p.date)}</td>
                      <td className="px-3 py-2">{p.competenceDate ? formatDateBR(p.competenceDate) : <span className="italic text-foreground-subtle">= data do pagamento</span>}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{CATEGORY_LABELS[p.category]}</Badge></td>
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2">{formatCurrency(Number(p.amount))}</td>
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
          <CardTitle>Adiantamentos</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {profile.advances.length === 0 ? (
            <EmptyState title="Nenhum adiantamento registrado" description="Este colaborador não tem nenhum adiantamento no histórico." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Valor</th>
                    <th className="px-3 py-2 text-left font-medium">Motivo</th>
                    <th className="px-3 py-2 text-left font-medium">Situação</th>
                    <th className="px-3 py-2 text-left font-medium">Compensado</th>
                    <th className="px-3 py-2 text-left font-medium">Saldo em aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.advances.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2">{formatDateBR(a.date)}</td>
                      <td className="px-3 py-2">{formatCurrency(Number(a.amount))}</td>
                      <td className="px-3 py-2">{a.reason ?? <span className="italic text-foreground-subtle">Não informado</span>}</td>
                      <td className="px-3 py-2"><Badge variant={ADVANCE_STATUS_VARIANT[a.status]}>{ADVANCE_STATUS_LABEL[a.status]}</Badge></td>
                      <td className="px-3 py-2">{formatCurrency(Number(a.compensatedAmount))}</td>
                      <td className="px-3 py-2">{formatCurrency(computeAdvanceOutstanding({ amount: Number(a.amount), compensatedAmount: Number(a.compensatedAmount) }))}</td>
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
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {profile.documents.length === 0 ? (
            <EmptyState title="Nenhum documento cadastrado." />
          ) : (
            <ul className="space-y-2 text-sm">
              {profile.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between">
                  <span>{d.documentType}</span>
                  <span className="text-xs text-foreground-subtle">{d.issueDate ? formatDateBR(d.issueDate) : "Sem data"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
