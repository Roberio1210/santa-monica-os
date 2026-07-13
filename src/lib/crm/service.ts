import "server-only";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchServiceOrders, JumpParkNotConfiguredError } from "@/lib/integrations/jumppark";
import { fetchAccountsReceivableOverview } from "@/lib/finance/service";
import type { AccountsReceivableView } from "@/lib/finance/types";
import { buildCrmCustomers } from "./aggregate";
import type { CrmCustomer, CrmListResult } from "./types";

/** Janela de histórico consultada no JumpPark a cada carregamento — nada é persistido. */
const HISTORY_DAYS = 180;

function isoDate(offsetDays: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

async function safeFetchReceivables(asOfDate: string): Promise<AccountsReceivableView[]> {
  try {
    const { items } = await fetchAccountsReceivableOverview(asOfDate);
    return items;
  } catch {
    return [];
  }
}

async function loadCustomers(): Promise<CrmListResult> {
  const jumpparkConfigured = isJumpParkConfigured();
  const asOfDate = isoDate(0);

  if (!jumpparkConfigured) {
    return { customers: [], jumpparkConfigured: false, error: "JumpPark não configurado neste ambiente.", historyDays: HISTORY_DAYS };
  }

  const startDate = isoDate(HISTORY_DAYS);

  try {
    const [orders, arItems] = await Promise.all([fetchServiceOrders(startDate, asOfDate), safeFetchReceivables(asOfDate)]);
    const customers = buildCrmCustomers(orders, arItems, asOfDate);
    return { customers, jumpparkConfigured: true, error: null, historyDays: HISTORY_DAYS };
  } catch (err) {
    const message = err instanceof JumpParkNotConfiguredError ? err.message : err instanceof Error ? err.message : "Falha ao carregar clientes.";
    return { customers: [], jumpparkConfigured, error: message, historyDays: HISTORY_DAYS };
  }
}

/** Lista de clientes derivada ao vivo do JumpPark + Contas a Receber — nenhuma tabela nova. */
export async function fetchCrmCustomers(): Promise<CrmListResult> {
  return loadCustomers();
}

export async function fetchCrmCustomerById(id: string): Promise<CrmCustomer | null> {
  const result = await loadCustomers();
  return result.customers.find((c) => c.id === id) ?? null;
}
