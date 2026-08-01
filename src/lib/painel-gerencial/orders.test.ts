import { describe, expect, it } from "vitest";
import type { JumpParkOrderInput } from "@/lib/domain/operational";
import {
  buildCustomerAggregates,
  buildManagementOrderRows,
  buildServiceAggregates,
  computeManagementIndicators,
  groupNetRevenueByDay,
  rankCustomersByVisits,
} from "@/lib/painel-gerencial/orders";

function order(overrides: Partial<JumpParkOrderInput> = {}): JumpParkOrderInput {
  return {
    serviceOrderId: "so-1",
    serviceOrderCode: "SO1",
    entryDateTime: "2026-07-20 10:00:00",
    exitDateTime: "2026-07-20 11:30:00",
    plate: "ABC1D23",
    vehicleModel: "COROLLA CROSS",
    paymentMethodName: "Crédito",
    clientName: "Fulano da Silva",
    clientPhone: "48999998888",
    amount: "0.00",
    amountServices: "180.00",
    totalAmount: 180,
    financialSituationName: "Pago",
    operationSituationName: "Fora do pátio",
    services: [{ description: "Lavação Silver - SUV", amount: "180.00" }],
    userOutputName: "Maria",
    ...overrides,
  };
}

describe("buildManagementOrderRows — dado real, sem máscara na área operacional", () => {
  it("exclui ordens sem saída registrada", () => {
    const rows = buildManagementOrderRows([order({ exitDateTime: undefined })]);
    expect(rows).toHaveLength(0);
  });

  it("nunca mascara placa nem telefone — apresentação operacional autorizada", () => {
    const [row] = buildManagementOrderRows([order()]);
    expect(row.licensePlate).toBe("ABC1D23");
    expect(row.customerPhone).toBe("48999998888");
  });

  it("campos ausentes viram 'Não informado', nunca um valor inventado", () => {
    const [row] = buildManagementOrderRows([order({ vehicleModel: undefined, clientName: null, plate: undefined })]);
    expect(row.vehicleModel).toBe("Não informado");
    expect(row.customerName).toBeNull();
    expect(row.licensePlate).toBeNull();
  });

  it("funcionário só aparece quando confirmado (operador de entrada/saída real)", () => {
    const [withOperator] = buildManagementOrderRows([order({ userOutputName: "Maria" })]);
    const [withoutOperator] = buildManagementOrderRows([order({ userOutputName: undefined, userName: undefined })]);
    expect(withOperator.employeeName).toBe("Maria");
    expect(withoutOperator.employeeName).toBeNull();
  });

  it("múltiplos serviços na mesma ordem aparecem todos, cada um com sua categoria", () => {
    const [row] = buildManagementOrderRows([
      order({
        services: [
          { description: "Lavação Silver", amount: "120.00" },
          { description: "Martelinho - Porta", amount: "300.00" },
        ],
      }),
    ]);
    expect(row.serviceLines).toHaveLength(2);
    expect(row.serviceLines.map((s) => s.category)).toEqual(["Lavação", "Martelinho"]);
  });

  it("Martelinho nunca é absorvido por Lavação, mesmo dentro da mesma ordem", () => {
    const [row] = buildManagementOrderRows([order({ services: [{ description: "Lavação + Martelinho combo" }] })]);
    expect(row.serviceCategory).toBe("Martelinho");
  });
});

describe("computeManagementIndicators — totalizações, descontos, ticket médio", () => {
  it("período sem nenhuma ordem retorna indicadores zerados, sem inventar dado", () => {
    const indicators = computeManagementIndicators([]);
    expect(indicators.ordersCount).toBe(0);
    expect(indicators.grossRevenue).toBe(0);
    expect(indicators.averageTicket).toBeNull();
  });

  it("soma bruto, desconto e líquido corretamente", () => {
    const rows = buildManagementOrderRows([order({ totalAmount: 100, discountAmount: "10.00" }), order({ serviceOrderId: "so-2", totalAmount: 200 })]);
    const indicators = computeManagementIndicators(rows);
    expect(indicators.grossRevenue).toBe(300);
    expect(indicators.discountTotal).toBe(10);
    expect(indicators.netRevenue).toBe(290);
  });

  it("ticket médio é líquido dividido pela quantidade de atendimentos", () => {
    const rows = buildManagementOrderRows([order({ totalAmount: 100 }), order({ serviceOrderId: "so-2", totalAmount: 200 })]);
    const indicators = computeManagementIndicators(rows);
    expect(indicators.averageTicket).toBe(150);
  });

  it("valor recebido soma só ordens com pagamento confirmado (Pago exatamente)", () => {
    const rows = buildManagementOrderRows([
      order({ financialSituationName: "Pago", totalAmount: 100 }),
      order({ serviceOrderId: "so-2", financialSituationName: "Em aberto", totalAmount: 200 }),
    ]);
    const indicators = computeManagementIndicators(rows);
    expect(indicators.receivedAmount).toBe(100);
    expect(indicators.pendingAmount).toBe(200);
  });
});

describe("buildCustomerAggregates — agrupamento de clientes", () => {
  it("agrupa por cliente real (telefone), nunca inclui atendimento sem identidade", () => {
    const rows = buildManagementOrderRows([
      order({ clientPhone: "48999998888", clientName: "Fulano", totalAmount: 100 }),
      order({ serviceOrderId: "so-2", clientPhone: "48999998888", clientName: "Fulano", totalAmount: 200 }),
      order({ serviceOrderId: "so-3", clientPhone: null, clientName: null, totalAmount: 50 }),
    ]);
    const customers = buildCustomerAggregates(rows);
    expect(customers).toHaveLength(1);
    expect(customers[0].visits).toBe(2);
    expect(customers[0].totalSpent).toBe(300);
    expect(customers[0].averageTicket).toBe(150);
  });

  it("ranking por visitas ordena de forma diferente do ranking por gasto quando fizer sentido", () => {
    const rows = buildManagementOrderRows([
      order({ clientPhone: "111", clientName: "Cliente Frequente", totalAmount: 50 }),
      order({ serviceOrderId: "so-2", clientPhone: "111", clientName: "Cliente Frequente", totalAmount: 50 }),
      order({ serviceOrderId: "so-3", clientPhone: "111", clientName: "Cliente Frequente", totalAmount: 50 }),
      order({ serviceOrderId: "so-4", clientPhone: "222", clientName: "Cliente Grande Ticket", totalAmount: 500 }),
    ]);
    const byVisits = rankCustomersByVisits(buildCustomerAggregates(rows));
    expect(byVisits[0].name).toBe("Cliente Frequente");
  });
});

describe("buildServiceAggregates — agrupamento de serviços", () => {
  it("Martelinho e Lavação aparecem como serviços distintos, nenhum descartado", () => {
    const rows = buildManagementOrderRows([
      order({ services: [{ description: "Lavação Silver", amount: "120.00" }, { description: "Martelinho - Porta", amount: "300.00" }] }),
    ]);
    const services = buildServiceAggregates(rows);
    expect(services.map((s) => s.description).sort()).toEqual(["Lavação Silver", "Martelinho - Porta"]);
    expect(services.find((s) => s.description === "Martelinho - Porta")?.category).toBe("Martelinho");
  });

  it("participação no faturamento soma 100% entre os serviços do período", () => {
    const rows = buildManagementOrderRows([order({ services: [{ description: "A", amount: "100" }, { description: "B", amount: "300" }] })]);
    const services = buildServiceAggregates(rows);
    const totalShare = services.reduce((sum, s) => sum + s.revenueShare, 0);
    expect(Math.round(totalShare)).toBe(100);
  });

  it("desconto da ordem é alocado proporcionalmente entre os serviços da própria ordem", () => {
    const rows = buildManagementOrderRows([
      order({ discountAmount: "40.00", services: [{ description: "A", amount: "100" }, { description: "B", amount: "300" }] }),
    ]);
    const services = buildServiceAggregates(rows);
    const a = services.find((s) => s.description === "A")!;
    const b = services.find((s) => s.description === "B")!;
    expect(a.discountAmount).toBe(10);
    expect(b.discountAmount).toBe(30);
  });
});

describe("groupNetRevenueByDay", () => {
  it("agrupa por data (YYYY-MM-DD), somando o líquido de todas as ordens do dia", () => {
    const rows = buildManagementOrderRows([
      order({ exitDateTime: "2026-07-20 11:00:00", totalAmount: 100 }),
      order({ serviceOrderId: "so-2", exitDateTime: "2026-07-20 15:00:00", totalAmount: 50 }),
      order({ serviceOrderId: "so-3", exitDateTime: "2026-07-21 09:00:00", totalAmount: 80 }),
    ]);
    const byDay = groupNetRevenueByDay(rows);
    expect(byDay.get("2026-07-20")).toBe(150);
    expect(byDay.get("2026-07-21")).toBe(80);
  });
});
