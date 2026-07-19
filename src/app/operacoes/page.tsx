import { redirect } from "next/navigation";

/** Rota antiga renomeada para /movimentacoes (Sprint Operação Real 1.0) — redireciona para não quebrar links salvos. */
export default function OperacoesRedirectPage() {
  redirect("/movimentacoes");
}
