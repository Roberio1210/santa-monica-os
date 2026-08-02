import { PageHeader } from "@/components/shared/page-header";
import { NewAttendanceFlow } from "@/components/attendance/new-attendance-flow";

export const dynamic = "force-dynamic";

export default function NovoAtendimentoPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Novo Atendimento" description="Busque o cliente pelo telefone ou placa — se não existir, cadastre em segundos." />
      <NewAttendanceFlow />
    </div>
  );
}
