import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { DreView } from "@/components/finance/dre-view";
import {
  fetchDreByCostCenterGroups,
  fetchDreComparison,
  fetchDreMonthlySeries,
  fetchDrePendencyOverview,
  fetchDreSourceData,
  computeAccountingAlerts,
  computeDreCoverage,
  lastDayOfMonth,
} from "@/lib/finance/service";
import { getOfficialClosedDre } from "@/lib/finance/dreSnapshot";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { fetchRevenueReconciliation } from "@/lib/finance/revenueReconciliation";
import { getStorageMode } from "@/lib/storage/mode";
import type { DreCostCenterGroup, DreRegime } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function previousMonthRange(from: string): { from: string; to: string } {
  const date = new Date(`${from}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const prevFrom = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const prevTo = new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).toISOString().slice(0, 10);
  return { from: prevFrom, to: prevTo };
}

interface DreSearchParams {
  regime?: string;
  from?: string;
  to?: string;
  costCenterGroup?: string;
  /** Fase C7 — força a visão ao vivo mesmo quando a competência está oficialmente fechada. Nunca automático: só quando o usuário pede explicitamente ("Ver dados atuais recalculados"). */
  live?: string;
}

function monthsFromJanuaryToCurrent(): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let m = 0; m <= now.getUTCMonth(); m++) {
    months.push(`${now.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`);
  }
  return months;
}

export default async function DrePage({ searchParams }: { searchParams: Promise<DreSearchParams> }) {
  const params = await searchParams;
  const defaultRange = currentMonthRange();
  const regime: DreRegime = params.regime === "caixa" ? "caixa" : params.regime === "competencia" ? "competencia" : "gerencial";
  const from = params.from || defaultRange.from;
  const to = params.to || defaultRange.to;
  const costCenterGroup = (params.costCenterGroup as DreCostCenterGroup | "consolidado" | undefined) ?? "consolidado";
  const previousRange = previousMonthRange(from);
  const today = new Date().toISOString().slice(0, 10);
  const months = monthsFromJanuaryToCurrent();
  const currentMonth = today.slice(0, 7);

  // Uma única busca de dados-fonte, reaproveitada pelos 3 relatórios abaixo — ver comentário em
  // fetchDreSourceData (Missão V3.0): buscar 3x em paralelo serializa no pool de conexão único do
  // Neon e torna o carregamento da página lentíssimo.
  const sourceData = await fetchDreSourceData();
  const [comparison, byCostCenter, monthlySeries] = await Promise.all([
    fetchDreComparison(regime, from, to, previousRange.from, previousRange.to, costCenterGroup, sourceData),
    fetchDreByCostCenterGroups(regime, from, to, sourceData),
    // Agosto (e qualquer mês corrente) é sempre parcial — corta em "hoje", nunca inventa dado até o fim do mês.
    fetchDreMonthlySeries(regime, months, costCenterGroup, { [currentMonth]: { to: today } }, sourceData),
  ]);

  const faturamentoOperacional =
    comparison.current.receitaBruta !== null ? Math.round((comparison.current.receitaBrutaEstetica.amount + comparison.current.receitaBrutaEstacionamento.amount) * 100) / 100 : null;
  const [pendencyOverview, revenueReconciliation] = await Promise.all([fetchDrePendencyOverview(comparison.current), fetchRevenueReconciliation(from, to, faturamentoOperacional)]);
  const isPartialPeriod = to > today;
  const storageMode = getStorageMode();

  /**
   * Fase C7 — período fechado mostra o snapshot oficial, nunca recalcula silenciosamente. Só
   * tenta o snapshot quando a janela vista é exatamente um mês calendário inteiro (a competência
   * de um fechamento é sempre "YYYY-MM" completo) e o usuário não pediu explicitamente o cálculo
   * ao vivo via `?live=1`. Se o período está "fechado" mas nenhum snapshot existe (estado
   * inconsistente de um fechamento legado, anterior a esta missão), cai para o comportamento ao
   * vivo em vez de travar a página.
   */
  const competenceMonth = from.slice(0, 7);
  const isExactMonthWindow = from === `${competenceMonth}-01` && to === lastDayOfMonth(competenceMonth);
  const wantsLive = params.live === "1";
  const accountingPeriod = isExactMonthWindow ? await getFinanceRepository().getAccountingPeriod(competenceMonth) : null;
  const officialSnapshot = accountingPeriod?.status === "fechado" && !wantsLive ? await getOfficialClosedDre(competenceMonth) : null;

  const displayedReport = officialSnapshot?.reportPayload ?? comparison.current;
  const coverage = computeDreCoverage(displayedReport);
  const alerts = computeAccountingAlerts(displayedReport, comparison.previous, byCostCenter, coverage, officialSnapshot ? false : isPartialPeriod);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DRE Gerencial"
        description="DRE gerencial para apoio à administração. Não substitui escrituração contábil, demonstrações oficiais ou obrigações preparadas pela contabilidade."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      {officialSnapshot ? (
        <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <p className="font-medium">
            Fechamento oficial — versão {officialSnapshot.version} de {competenceMonth}
          </p>
          <p className="mt-1 text-emerald-800/80 dark:text-emerald-300/80">
            Fechado em {new Date(officialSnapshot.closedAt).toLocaleString("pt-BR")} por {officialSnapshot.closedBy}. Estes números estão congelados e não mudam mesmo que fontes como
            JumpPark/Stone sincronizem dados novos para este período depois do fechamento.{" "}
            <a className="underline" href={`/financeiro/dre?regime=${regime}&from=${from}&to=${to}&costCenterGroup=${costCenterGroup}&live=1`}>
              Ver dados atuais recalculados
            </a>
            .
          </p>
        </div>
      ) : accountingPeriod?.status === "fechado" ? (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Esta competência está marcada como fechada, mas não existe um fechamento oficial (snapshot) registrado para ela — provavelmente um fechamento anterior à Fase C7. Mostrando dados em
          tempo real.
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Dados em tempo real — esta competência ainda não foi fechada.</div>
      )}

      <DreView
        report={displayedReport}
        previous={comparison.previous}
        byCostCenter={byCostCenter}
        alerts={alerts}
        regime={regime}
        from={from}
        to={to}
        costCenterGroup={costCenterGroup}
        monthlySeries={monthlySeries}
        pendencyOverview={pendencyOverview}
        coverage={coverage}
        revenueReconciliation={revenueReconciliation}
      />
    </div>
  );
}
