import type { Fact, Finding } from "@/lib/zezinho/reasoning/types";

/**
 * Achados (Etapa 4, segunda camada) — relaciona 2+ fatos, nunca prescreve ação. Tabela de regras
 * determinística, versionada em código. Cada regra só dispara quando os fatos que ela precisa
 * realmente existem (nunca assume um fato ausente).
 */

function byKey(facts: Fact[]): Map<string, Fact> {
  return new Map(facts.map((f) => [f.key, f]));
}

export function deriveFindings(facts: Fact[]): Finding[] {
  const findings: Finding[] = [];
  const f = byKey(facts);

  const revenue = f.get("revenue");
  const ticket = f.get("avgTicket");
  const washCount = f.get("washCount");
  const vehicles = f.get("vehicles");
  const bronze = f.get("packageBronze");
  const silverOrGold = f.get("packageSilver") ?? f.get("packageGold");
  const cashResultado = f.get("cashResultado");
  const cashEntradas = f.get("cashEntradas");

  if (revenue && ticket && (washCount || vehicles)) {
    const volume = washCount ?? vehicles!;
    if (revenue.direction === "aumento" && volume.direction === "aumento" && ticket.direction !== "aumento") {
      findings.push({ key: "revenue_from_volume", statement: "O aumento do faturamento veio do volume de atendimentos, não de um ticket médio maior.", factKeys: [revenue.key, volume.key, ticket.key], confidence: "alta" });
    }
    if (revenue.direction === "queda" && volume.direction !== "queda" && ticket.direction === "queda") {
      findings.push({ key: "revenue_from_ticket_drop", statement: "A queda de faturamento está ligada à queda do ticket médio, não a menos atendimentos.", factKeys: [revenue.key, volume.key, ticket.key], confidence: "alta" });
    }
  }

  if (ticket && bronze && ticket.direction === "queda" && bronze.direction === "aumento") {
    findings.push({ key: "mix_downgrade", statement: "A queda do ticket médio coincide com mais clientes optando pelo pacote Bronze (serviço básico).", factKeys: [ticket.key, bronze.key], confidence: "media" });
  }

  if (bronze && silverOrGold && bronze.direction === "aumento" && silverOrGold.direction !== "aumento") {
    findings.push({ key: "mix_bronze_dominant", statement: "O Bronze está crescendo mais que os pacotes de maior valor (Silver/Gold).", factKeys: [bronze.key, silverOrGold.key], confidence: "media" });
  }

  if (cashResultado && revenue && cashResultado.direction === "queda" && revenue.direction !== "queda") {
    findings.push({ key: "cash_registration_gap", statement: "O faturamento operacional não caiu, mas o resultado de caixa sim — pode faltar lançar alguma entrada, não necessariamente um problema de vendas.", factKeys: [revenue.key, cashResultado.key], confidence: "media" });
  }

  if (cashEntradas && cashEntradas.direction === "estavel" && cashEntradas.statement.includes("R$ 0,00")) {
    findings.push({ key: "cash_no_movement", statement: "O caixa não teve nenhuma movimentação registrada no período.", factKeys: [cashEntradas.key], confidence: "alta" });
  }

  const atRiskCount = f.get("crm_at_risk_count");
  if (atRiskCount) {
    findings.push({ key: "clients_at_risk", statement: atRiskCount.statement, factKeys: [atRiskCount.key], confidence: "alta" });
  }

  const servicesWithoutRecipe = facts.find((fact) => fact.key.startsWith("alert_") && fact.label.toLowerCase().includes("sem receita"));
  if (servicesWithoutRecipe) {
    findings.push({ key: "recipe_gap", statement: "Alguns serviços não têm receita de consumo cadastrada — não dá para comparar consumo esperado com o real para eles.", factKeys: [servicesWithoutRecipe.key], confidence: "alta" });
  }

  return findings;
}
