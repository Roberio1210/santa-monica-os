import { PageHeader } from "@/components/shared/page-header";
import { ServiceMappingReviewView } from "@/components/inventory/service-mapping-review-view";
import { listServiceMappings } from "@/lib/jumppark-orders/service-mapping";
import { listServices } from "@/lib/inventory/services-catalog";

export const dynamic = "force-dynamic";

export default async function MapeamentosServicosPage() {
  const [mappings, services] = await Promise.all([listServiceMappings(), listServices()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapeamentos de serviços JumpPark"
        description="Cada texto real de serviço vendido na JumpPark precisa ser conectado a um serviço do catálogo de receitas antes que o consumo automático possa calculá-lo. Nunca mapeado por preço nem por aproximação — casos duvidosos ficam 'não mapeado' até revisão manual."
      />
      <ServiceMappingReviewView mappings={mappings} services={services} />
    </div>
  );
}
