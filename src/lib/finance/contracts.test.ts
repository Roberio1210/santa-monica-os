import { describe, expect, it } from "vitest";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";

/** Missão Financeiro V2 (Prioridade 4) — capacidade operacional de registrar mensalistas/parcerias. */
describe("StaticFinanceRepository — cadastro de parceiro e contrato (mensalistas)", () => {
  it("cadastra um novo parceiro e o retorna em listPartners", async () => {
    const repo = new StaticFinanceRepository();
    const partner = await repo.createPartner({ name: "Don Juan", type: "contrato_mensal" });

    expect(partner.id).toBeTruthy();
    expect(partner.name).toBe("Don Juan");
    const partners = await repo.listPartners();
    expect(partners.some((p) => p.id === partner.id)).toBe(true);
  });

  it("cadastra um contrato de mensalidade vinculado a um parceiro novo, sem inventar valor quando não informado", async () => {
    const repo = new StaticFinanceRepository();
    const partner = await repo.createPartner({ name: "Don Juan", type: "contrato_mensal" });

    const contract = await repo.createContract({
      partnerId: partner.id,
      title: "Mensalidade Don Juan",
      type: "mensalidade",
      dueDay: 15,
    });

    expect(contract.partnerId).toBe(partner.id);
    expect(contract.partnerName).toBe("Don Juan");
    expect(contract.baseValue).toBeNull();
    expect(contract.status).toBe("ativo");
    const contracts = await repo.listContracts();
    expect(contracts.some((c) => c.id === contract.id)).toBe(true);
  });

  it("cadastra um contrato com valor fixo real informado explicitamente pelo usuário", async () => {
    const repo = new StaticFinanceRepository();
    const partner = await repo.createPartner({ name: "Funerária Modelo", type: "contrato_mensal" });

    const contract = await repo.createContract({
      partnerId: partner.id,
      title: "Mensalidade Funerária",
      type: "mensalidade",
      baseValue: 1000,
      benefit: { description: "Lavação completa", quantityPerPeriod: 6, periodType: "mensal", cumulative: false },
    });

    expect(contract.baseValue).toBe(1000);
    expect(contract.benefits).toHaveLength(1);
    expect(contract.benefits[0].description).toBe("Lavação completa");
    expect(contract.benefits[0].quantityPerPeriod).toBe(6);
    expect(contract.benefits[0].cumulative).toBe(false);
  });

  it("cadastra uma parceria pós-paga com dia de fechamento, sem gerar nenhuma cobrança sozinho", async () => {
    const repo = new StaticFinanceRepository();
    const partner = await repo.createPartner({ name: "Nova Parceria Teste", type: "parceria_pos_paga" });

    const contract = await repo.createContract({
      partnerId: partner.id,
      title: "Parceria Nova Teste",
      type: "parceria_pos_paga",
      billingClosingDay: 1,
      dueDay: 10,
    });

    expect(contract.type).toBe("parceria_pos_paga");
    expect(contract.billingClosingDay).toBe(1);
    expect(contract.dueDay).toBe(10);

    const receivables = await repo.listAccountsReceivable();
    expect(receivables.every((r) => r.partnerId !== partner.id)).toBe(true);
  });
});
