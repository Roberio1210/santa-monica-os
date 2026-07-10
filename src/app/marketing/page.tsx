import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockCampaigns, mockMarketingSummary } from "@/data/mock/marketing";
import { formatCurrency, formatCompactNumber } from "@/lib/utils/format";
import { DollarSign, Eye, Target, Users } from "lucide-react";
import type { CampaignRecommendation } from "@/types/marketing";

const channelLabels: Record<string, string> = {
  meta: "Meta Ads",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
};

const recommendationMeta: Record<CampaignRecommendation, { label: string; variant: "positive" | "info" | "warning" | "critical" | "outline" }> = {
  manter: { label: "Manter", variant: "info" },
  observar: { label: "Observar", variant: "outline" },
  sugerir_pausa: { label: "Sugerir pausa", variant: "critical" },
  sugerir_aumento: { label: "Sugerir aumento", variant: "positive" },
  sugerir_nova_criacao: { label: "Sugerir nova criação", variant: "warning" },
};

export default function MarketingPage() {
  const best = mockCampaigns.find((c) => c.id === mockMarketingSummary.bestCampaignId);
  const worst = mockCampaigns.find((c) => c.id === mockMarketingSummary.worstCampaignId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Campanhas, alcance e leads. Nenhuma ação é executada automaticamente."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Investimento" value={formatCurrency(mockMarketingSummary.totalInvestment)} icon={DollarSign} />
        <StatCard label="Alcance" value={formatCompactNumber(mockMarketingSummary.totalReach)} icon={Eye} />
        <StatCard label="Leads" value={String(mockMarketingSummary.totalLeads)} icon={Users} />
        <StatCard label="Custo por lead médio" value={formatCurrency(mockMarketingSummary.averageCostPerLead)} icon={Target} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Melhor anúncio</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm font-medium text-foreground">{best?.name ?? "—"}</p>
            <p className="text-xs text-foreground-muted">
              CPL {best ? formatCurrency(best.costPerLead) : "—"} · {best?.leads ?? 0} leads
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pior anúncio</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm font-medium text-foreground">{worst?.name ?? "—"}</p>
            <p className="text-xs text-foreground-muted">
              CPL {worst ? formatCurrency(worst.costPerLead) : "—"} · {worst?.leads ?? 0} leads
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Campanha</th>
                  <th className="pb-2 pr-3 font-medium">Canal</th>
                  <th className="pb-2 pr-3 font-medium">Investimento</th>
                  <th className="pb-2 pr-3 font-medium">Alcance</th>
                  <th className="pb-2 pr-3 font-medium">Cliques</th>
                  <th className="pb-2 pr-3 font-medium">Leads</th>
                  <th className="pb-2 pr-3 font-medium">CPL</th>
                  <th className="pb-2 font-medium">Recomendação</th>
                </tr>
              </thead>
              <tbody>
                {mockCampaigns.map((campaign) => {
                  const rec = recommendationMeta[campaign.recommendation];
                  return (
                    <tr key={campaign.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{campaign.name}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{channelLabels[campaign.channel]}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(campaign.investment)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCompactNumber(campaign.reach)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{campaign.clicks}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{campaign.leads}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(campaign.costPerLead)}</td>
                      <td className="py-2">
                        <Badge variant={rec.variant}>{rec.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
