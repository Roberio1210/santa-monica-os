import { redirect } from "next/navigation";

/**
 * Missão 25 (04/08/2026) — esta rota era uma segunda tela de "clientes", 100% com dado mock
 * (`src/data/mock/customers.ts`+`vehicles.ts`), coexistindo com o CRM Inteligente real (`/crm`,
 * Postgres via AttendanceRepository). Mesma decisão de unificação da Missão 25: só existe uma
 * fonte oficial de identidade/histórico de cliente no Santa Monica OS, que é `/crm`. Redireciona
 * para não quebrar links salvos, mesmo padrão de `/operacoes` → `/movimentacoes`. Os arquivos de
 * dado mock não foram excluídos (preservados, sem exclusão destrutiva). Ver
 * docs/mission-25-decisions.md.
 */
export default function ClientesRedirectPage() {
  redirect("/crm");
}
