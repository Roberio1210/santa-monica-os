import type { ReactNode } from "react";
import { VehicleCard } from "@/components/crm/vehicle-card";
import { DiagnosticEvolutionCard } from "@/components/crm/diagnostic-evolution-card";
import { ProtectionsCard } from "@/components/crm/protections-card";
import { RecommendationsCard } from "@/components/crm/recommendations-card";
import type { VehicleCrmDetail } from "@/lib/crm-intelligente/types";

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground-muted">{title}</p>
      {children}
    </div>
  );
}

export function VehicleSection({ detail }: { detail: VehicleCrmDetail }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-background-panel p-3.5">
      <VehicleCard memory={detail.memory} />
      <SubSection title="Memória técnica (evolução do diagnóstico)">
        <DiagnosticEvolutionCard evolution={detail.diagnosticEvolution} />
      </SubSection>
      <SubSection title="Proteções ativas">
        <ProtectionsCard protections={detail.activeProtections} />
      </SubSection>
      <SubSection title="O que faz sentido oferecer">
        <RecommendationsCard recommendations={detail.recommendations} />
      </SubSection>
    </div>
  );
}
