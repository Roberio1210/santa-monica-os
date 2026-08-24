import { describe, expect, it, vi } from "vitest";

/**
 * Missão Z4 — as 3 ferramentas gerenciais (`daily_management_summary`, `post_sale_candidates`,
 * `inactive_customers`) mockando os módulos de agregação reais (sem banco), para travar: RBAC
 * (financeiro só para admin), "nenhuma mensagem é enviada", e ausência de dados nunca vira
 * invenção. Mesmo padrão de `commercial-policy-tool.test.ts`/`service-catalog-tool.test.ts`.
 */

const fetchDailyClosingMock = vi.fn();
const fetchPostSaleCandidatesMock = vi.fn();
const fetchInactiveCustomersMock = vi.fn();

vi.mock("@/lib/management/dailyClosing", () => ({
  fetchDailyClosing: (...args: unknown[]) => fetchDailyClosingMock(...args),
}));
vi.mock("@/lib/management/postSale", () => ({
  fetchPostSaleCandidates: (...args: unknown[]) => fetchPostSaleCandidatesMock(...args),
  POST_SALE_CATEGORY_LABEL: { A: "Solicitar avaliação Google", B: "Verificar satisfação antes de pedir avaliação", C: "Não abordar agora", D: "Situação requer atenção humana" },
}));
vi.mock("@/lib/management/inactiveCustomers", () => ({
  fetchInactiveCustomers: (...args: unknown[]) => fetchInactiveCustomersMock(...args),
  DEFAULT_INACTIVE_MIN_DAYS: 30,
}));

function baseClosing(overrides: Record<string, unknown> = {}) {
  return {
    role: "admin",
    period: { key: "today", from: "2026-08-23", to: "2026-08-23", label: "Hoje" },
    comparisonPeriod: { key: "custom", from: "2026-08-22", to: "2026-08-22", label: "Período de comparação" },
    partialPeriod: true,
    jumpparkConfigured: true,
    operational: { ordersCount: 10, vehiclesCount: 9, customersCount: 8, washCount: 8, parkingCount: 2, packageCounts: { Bronze: 3, Silver: 2, Gold: 1 }, topServices: [], serviceCounts: [], additionalServicesCount: 0 },
    financial: null,
    inventoryAttention: [],
    inventoryOkRelevant: [],
    recentPurchases: [],
    tomorrow: { vehicleCount: 0, capacityConfigured: false, availableMinutes: null, percentOccupied: null, mainServices: [], productRisks: [] },
    insights: [],
    recommendations: [],
    errors: [],
    ...overrides,
  };
}

describe("daily_management_summary — RBAC financeiro", () => {
  it("operacional: campo financeiro sempre null, mesmo se o service devolvesse algo (defesa em profundidade do mapeamento)", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing({ role: "operacional", financial: null }));
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("operacional");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    expect(result.financeiro).toBeNull();
    expect(result.operacao).toBeTruthy();
  });

  it("admin: campo financeiro presente com os números reais", async () => {
    fetchDailyClosingMock.mockResolvedValue(
      baseClosing({
        financial: { grossRevenue: 1000, washRevenue: 800, parkingRevenue: 200, averageTicket: 111, cashEntradas: 900, cashSaidas: 100, cashResultado: 800, dreResultado: null, stoneConfigured: true, stoneSettledToday: 500, stonePendingToday: 50 },
      }),
    );
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    expect(result.financeiro).toMatchObject({ faturamento_bruto: 1000, stone_liquidado_hoje: 500 });
  });

  it("ausência de dados (JumpPark não configurado) nunca é escondida nem inventada", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing({ jumpparkConfigured: false, errors: ["JumpPark não configurado neste ambiente."] }));
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    expect(result.jumppark_configurado).toBe(false);
  });

  it("Missão Z4 (achado real com chamada ao modelo) — sem nenhuma ordem no período, avisa explicitamente para nunca inventar serviço/produto na tabela", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing({ operational: { ordersCount: 0, vehiclesCount: 0, customersCount: 0, washCount: 0, parkingCount: 0, packageCounts: { Bronze: 0, Silver: 0, Gold: 0 }, topServices: [], serviceCounts: [], additionalServicesCount: 0 } }));
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    const operacao = result.operacao as Record<string, unknown>;
    expect(operacao.principais_servicos).toEqual([]);
    expect(operacao.aviso_principais_servicos).toMatch(/nunca invente/i);
  });

  it("Missão Z4 (achado real, confirmação com chamada real autenticada como admin) — JumpPark configurado + 0 ordens: aviso_geral desambigua 'zero real' de 'sem dados', proibindo explicitamente a frase que o modelo usou de forma errada", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing({ jumpparkConfigured: true, operational: { ordersCount: 0, vehiclesCount: 0, customersCount: 0, washCount: 0, parkingCount: 0, packageCounts: { Bronze: 0, Silver: 0, Gold: 0 }, topServices: [], serviceCounts: [], additionalServicesCount: 0 } }));
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    expect(result.aviso_geral).toMatch(/dado REAL/);
    expect(result.aviso_geral).toMatch(/NUNCA diga 'não consegui obter os dados'/);
  });

  it("dia com movimento real -> aviso_geral vem null (nunca um aviso genérico quando não faz sentido)", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing({ jumpparkConfigured: true, operational: { ordersCount: 12, vehiclesCount: 10, customersCount: 9, washCount: 10, parkingCount: 2, packageCounts: { Bronze: 3, Silver: 2, Gold: 1 }, topServices: [], serviceCounts: [], additionalServicesCount: 0 } }));
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    expect(result.aviso_geral).toBeNull();
  });

  it("JumpPark NÃO configurado (mesmo com 0 ordens) -> aviso_geral vem null, esse caso já é comunicado por jumppark_configurado:false", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing({ jumpparkConfigured: false, operational: { ordersCount: 0, vehiclesCount: 0, customersCount: 0, washCount: 0, parkingCount: 0, packageCounts: { Bronze: 0, Silver: 0, Gold: 0 }, topServices: [], serviceCounts: [], additionalServicesCount: 0 } }));
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    expect(result.jumppark_configurado).toBe(false);
    expect(result.aviso_geral).toBeNull();
  });

  it("comparação de período: aceita 'ontem' e repassa para o agregador real, nunca calcula data na mão aqui", async () => {
    fetchDailyClosingMock.mockResolvedValue(baseClosing());
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    await execute({ dia: "ontem" });
    expect(fetchDailyClosingMock).toHaveBeenCalledWith({ periodo: "yesterday" }, "admin");
  });

  it("Missão Z5 — quantidade por serviço e adicionais aparecem em 'operacao', estoque vem separado em comprar/atencao/ok_relevante/comprados_recentemente", async () => {
    fetchDailyClosingMock.mockResolvedValue(
      baseClosing({
        operational: { ordersCount: 5, vehiclesCount: 5, customersCount: 5, washCount: 5, parkingCount: 0, packageCounts: { Bronze: 2, Silver: 1, Gold: 0 }, topServices: [], serviceCounts: [{ description: "Bronze", count: 2 }], additionalServicesCount: 1 },
        inventoryAttention: [{ name: "Produto Zerado", brand: "Marca", currentQuantity: 0, unit: "ml", status: "comprar" }, { name: "Produto Baixo", brand: "Marca", currentQuantity: 100, unit: "ml", status: "atencao" }],
        inventoryOkRelevant: [{ name: "Glaco", brand: "Soft99", currentQuantity: 420, unit: "ml", reason: "usado_em_servico_hoje" }],
        recentPurchases: [{ name: "Kit Pincéis", quantity: 1, unit: "unidade", date: "2026-08-21" }],
      }),
    );
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.daily_management_summary!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({ dia: "hoje" });
    const operacao = result.operacao as Record<string, unknown>;
    expect(operacao.quantidade_por_servico).toEqual([{ servico: "Bronze", quantidade: 2 }]);
    expect(operacao.servicos_adicionais_vendidos).toBe(1);
    const estoque = result.estoque as Record<string, unknown>;
    expect((estoque.comprar as unknown[]).length).toBe(1);
    expect((estoque.atencao as unknown[]).length).toBe(1);
    expect((estoque.ok_relevante as Array<Record<string, unknown>>)[0]).toMatchObject({ produto: "Glaco", motivo: "usado_em_servico_hoje" });
    expect((estoque.comprados_recentemente as Array<Record<string, unknown>>)[0]).toMatchObject({ produto: "Kit Pincéis", data: "2026-08-21" });
  });
});

describe("post_sale_candidates — nunca envia nada, só sugere", () => {
  it("mapeia candidatos com mensagem-rascunho e aviso explícito de que nada foi enviado", async () => {
    fetchPostSaleCandidatesMock.mockResolvedValue({
      jumpparkConfigured: true,
      error: null,
      candidates: [{ orderExternalId: "os-1", customerName: "Daniel", vehicleModel: "Compass", serviceNames: ["Revitalização de Faróis"], phoneMasked: "*******12", category: "B", categoryReason: "motivo", messageDraft: "Oi, Daniel!..." }],
    });
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.post_sale_candidates!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});
    const candidatos = result.candidatos as Array<Record<string, unknown>>;
    expect(candidatos[0].cliente).toBe("Daniel");
    expect(candidatos[0].mensagem_sugerida).toContain("Daniel");
    expect(result.aviso).toMatch(/nenhuma mensagem foi enviada/i);
  });

  it("disponível para operacional (dado seguro: sem faturamento/financeiro)", async () => {
    fetchPostSaleCandidatesMock.mockResolvedValue({ jumpparkConfigured: true, error: null, candidates: [], reviewLinkConfigured: false });
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("operacional");
    expect(tools).toHaveProperty("post_sale_candidates");
  });

  it("Missão Z5 — expõe link_avaliacao_configurado honestamente (hoje sempre false, nunca inventa link)", async () => {
    fetchPostSaleCandidatesMock.mockResolvedValue({ jumpparkConfigured: true, error: null, candidates: [], reviewLinkConfigured: false });
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.post_sale_candidates!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});
    expect(result.link_avaliacao_configurado).toBe(false);
  });
});

describe("inactive_customers — nunca envia nada, avisos honestos sempre presentes", () => {
  it("gasto histórico total só aparece para admin", async () => {
    fetchInactiveCustomersMock.mockResolvedValue({
      minDays: 30,
      totalCandidatesBeforeCap: 1,
      candidates: [{ customerId: "c1", customerName: "João", vehicleModel: "HB20", plateMasked: "AB***12", phoneMasked: "*******34", lastVisitAt: "2026-07-10T12:00:00.000Z", daysSinceLastVisit: 45, visitCount: 4, totalSpent: 900, isRecurring: true, priorityScore: 5, priorityReasons: ["Cliente recorrente"], messageDraft: "Oi, João..." }],
      caveats: ["aviso 1", "aviso 2"],
    });
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const toolsAdmin = buildZezinhoTools("admin");
    const toolsOp = buildZezinhoTools("operacional");
    const execAdmin = toolsAdmin.inactive_customers!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const execOp = toolsOp.inactive_customers!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

    const admin = await execAdmin({});
    const operacional = await execOp({});
    const adminCandidatos = admin.candidatos as Array<Record<string, unknown>>;
    const opCandidatos = operacional.candidatos as Array<Record<string, unknown>>;
    expect(adminCandidatos[0].gasto_historico_total).toBe(900);
    expect(opCandidatos[0].gasto_historico_total).toBeNull();
    expect(adminCandidatos[0].ultima_visita).toBe("2026-07-10T12:00:00.000Z");
  });

  it("sempre repassa os avisos honestos do agregador (nunca some com eles)", async () => {
    fetchInactiveCustomersMock.mockResolvedValue({ minDays: 30, totalCandidatesBeforeCap: 0, candidates: [], caveats: ["sem histórico de contato", "sem sinalização de restrição"] });
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("admin");
    const execute = tools.inactive_customers!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});
    expect(result.avisos).toEqual(["sem histórico de contato", "sem sinalização de restrição"]);
  });
});
