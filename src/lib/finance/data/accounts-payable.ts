import type { AccountsPayable } from "@/lib/finance/types";

/**
 * Nenhuma conta a pagar é pré-cadastrada — só a fundação (fornecedores, contas financeiras,
 * modelos de recorrência). O proprietário confirma cada conta real pela tela
 * /financeiro/contas-a-pagar antes dela existir. Nunca inventar uma conta "de exemplo" aqui.
 */
export const initialAccountsPayable: AccountsPayable[] = [];
