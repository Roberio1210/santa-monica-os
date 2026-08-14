import { describe, expect, it } from "vitest";
import {
  addDiagnosticPhoto,
  addTechnicalRecommendation,
  advanceServiceOrderStatus,
  createServiceOrderFromApprovedServices,
  fetchCustomerTimeline,
  fetchDayManagement,
  fetchHomeSummary,
  fetchManagerBoard,
  fetchOperationsCenter,
  fetchOrderDetail,
  fetchRecentVehicles,
  fetchServiceCatalog,
  fetchServiceVisitContext,
  fetchTimelineFeed,
  fetchVehicleTimeline,
  listDiagnosticPhotos,
  registerQuickCustomerAndVehicle,
  saveDiagnosticStep,
  searchByPhoneOrPlate,
  searchCustomersByText,
  setServiceOrderStatus,
  startAttendance,
  startServiceOrder,
} from "@/lib/attendance/service";
import { emptyTechnicalDiagnostic, type TechnicalDiagnosticInput } from "@/lib/attendance/types";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";

function saveEmptyDiagnostic(visitId: string, overrides: Partial<TechnicalDiagnosticInput> = {}, observations: string | null = null) {
  const d = { ...emptyTechnicalDiagnostic(), ...overrides };
  return saveDiagnosticStep(visitId, d.pintura, d.rodas, d.pneus, d.vidros, d.motor, d.interior, observations);
}

/**
 * Testa contra `getAttendanceRepository()`, que em ambiente de teste (sem DATABASE_URL) sempre
 * resolve para `MemoryAttendanceRepository` — mesmo padrão já usado pelos outros módulos do
 * projeto (finance, inventory).
 */

describe("registerQuickCustomerAndVehicle", () => {
  it("cria cliente e veículo novos quando nenhum dos dois existe", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({
      customerName: "Roberio",
      customerPhone: "48999990001",
      vehiclePlate: "AAA1B11",
      vehicleBrand: "Toyota",
      vehicleModel: "Corolla",
    });
    expect(customer.name).toBe("Roberio");
    expect(vehicle.plate).toBe("AAA1B11");
    expect(vehicle.customerId).toBe(customer.id);
  });

  it("reaproveita cliente existente pelo telefone, nunca duplica", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Cliente A", customerPhone: "48999990002", vehiclePlate: "BBB2C22" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Cliente A (nome digitado de novo)", customerPhone: "48999990002", vehiclePlate: "CCC3D33" });
    expect(second.customer.id).toBe(first.customer.id);
  });

  it("reaproveita veículo existente do mesmo cliente pela placa, nunca duplica", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Cliente B", customerPhone: "48999990003", vehiclePlate: "DDD4E44" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Cliente B", customerPhone: "48999990003", vehiclePlate: "DDD4E44" });
    expect(second.vehicle.id).toBe(first.vehicle.id);
  });

  it("sem coincidência nenhuma, não gera nenhum aviso de duplicidade", async () => {
    const result = await registerQuickCustomerAndVehicle({ customerName: "Cliente Único", customerPhone: "48999990099", vehiclePlate: "ZZZ9Z99" });
    expect(result.possibleDuplicateCustomers).toEqual([]);
    expect(result.possibleDuplicateVehicles).toEqual([]);
  });
});

describe("registerQuickCustomerAndVehicle — aviso de possível duplicidade (Missão CRM V2 Fase 1, motor da Fase 2 desde a Missão Final)", () => {
  it("nome igual, mas TELEFONES COMPLETOS DIFERENTES: motor classifica CONFLICT — cria cliente novo (nunca funde por nome) e NÃO avisa, porque telefone completo contraditório é evidência forte de que são pessoas diferentes", async () => {
    await registerQuickCustomerAndVehicle({ customerName: "Homônimo Teste", customerPhone: "48999991111", vehiclePlate: "HOM1A11" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Homônimo Teste", customerPhone: "48999992222", vehiclePlate: "HOM2B22" });

    expect(second.possibleDuplicateCustomers).toEqual([]);
    // Aviso, nunca fusão: o cliente do segundo cadastro é um registro novo e distinto do primeiro.
    expect(second.customer.phone).toBe("48999992222");
  });

  it("cliente antigo com telefone mascarado (ex.: origem JumpPark) retorna com nome igual + telefone completo cujo sufixo bate: motor classifica HIGH_CONFIDENCE — avisa (Missão CRM V2 Final, Parte 6)", async () => {
    await registerQuickCustomerAndVehicle({ customerName: "Cliente Histórico Mascarado", customerPhone: "*******34", vehiclePlate: "MSK1A11" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Cliente Histórico Mascarado", customerPhone: "48999990034", vehiclePlate: "MSK2B22" });

    expect(second.possibleDuplicateCustomers).toHaveLength(1);
    expect(second.possibleDuplicateCustomers[0]?.name).toBe("Cliente Histórico Mascarado");
    // Aviso, nunca fusão automática: continua sendo um cadastro novo e distinto.
    expect(second.customer.phone).toBe("48999990034");
  });

  it("placa já cadastrada em outro cliente: cria veículo novo mesmo assim (nunca funde por placa) e avisa", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Dono Original", customerPhone: "48999993333", vehiclePlate: "PLA1C11" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Outro Cliente", customerPhone: "48999994444", vehiclePlate: "PLA1C11" });

    expect(second.possibleDuplicateVehicles).toHaveLength(1);
    expect(second.possibleDuplicateVehicles[0]?.customerId).toBe(first.customer.id);
    // Aviso, nunca fusão: o veículo do segundo cadastro pertence ao segundo cliente, não ao primeiro.
    expect(second.vehicle.customerId).toBe(second.customer.id);
    expect(second.vehicle.id).not.toBe(first.vehicle.id);
  });

  it("reaproveitar cliente/veículo existentes (telefone e placa exatos) nunca gera aviso — não há duplicidade real", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Retorno Cliente", customerPhone: "48999995555", vehiclePlate: "RET1D11" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Retorno Cliente", customerPhone: "48999995555", vehiclePlate: "RET1D11" });

    expect(second.customer.id).toBe(first.customer.id);
    expect(second.vehicle.id).toBe(first.vehicle.id);
    expect(second.possibleDuplicateCustomers).toEqual([]);
    expect(second.possibleDuplicateVehicles).toEqual([]);
  });

  it("Missão CRM V2 Final, cenário 12 — mesmo cliente com dois carros: ambos os veículos preservados, um nunca sobrescreve o outro", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Dois Carros", customerPhone: "48999990120", vehiclePlate: "DUO1A11" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Dois Carros", customerPhone: "48999990120", vehiclePlate: "DUO2B22" });
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.vehicle.id).not.toBe(first.vehicle.id);

    const vehicles = await getAttendanceRepository().listVehiclesByCustomer(first.customer.id);
    expect(vehicles.map((v) => v.plate).sort()).toEqual(["DUO1A11", "DUO2B22"]);
  });

  it("Missão CRM V2 Final, cenário 35 — cliente sem telefone nenhum continua pesquisável por nome/veículo", async () => {
    await registerQuickCustomerAndVehicle({ customerName: "Cliente Sem Telefone Nenhum", customerPhone: "", vehiclePlate: "SFT1A11", vehicleModel: "Onix" });
    const byName = await searchCustomersByText("Cliente Sem Telefone Nenhum");
    expect(byName).toHaveLength(1);
    const byModel = await searchCustomersByText("Onix");
    expect(byModel.some((r) => r.customer.name === "Cliente Sem Telefone Nenhum")).toBe(true);
  });

  it("Missão CRM V2 Final, cenário 36 — histórico preservado: mesmo quando o motor aponta possível duplicidade, nenhum dado do registro anterior é alterado/apagado, e nenhuma fusão acontece", async () => {
    const first = await registerQuickCustomerAndVehicle({ customerName: "Preserva Histórico", customerPhone: "*******99", vehiclePlate: "HIS1A11" });
    const second = await registerQuickCustomerAndVehicle({ customerName: "Preserva Histórico", customerPhone: "48999990199", vehiclePlate: "HIS2B22" });

    expect(second.possibleDuplicateCustomers).toHaveLength(1); // avisou...
    expect(second.customer.id).not.toBe(first.customer.id); // ...mas nunca fundiu.

    const originalStill = await getAttendanceRepository().getCustomer(first.customer.id);
    expect(originalStill?.name).toBe("Preserva Histórico");
    expect(originalStill?.phone).toBe("*******99"); // dado original intocado.
  });
});

describe("searchByPhoneOrPlate", () => {
  it("encontra cliente pelo telefone e retorna histórico honesto (vazio para cliente novo)", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({ customerName: "Busca Telefone", customerPhone: "48999990010", vehiclePlate: "EEE5F55" });
    const result = await searchByPhoneOrPlate("48999990010");
    expect(result?.customer.id).toBe(customer.id);
    expect(result?.history.lastVisitAt).toBeNull();
    expect(result?.history.activeProtections).toEqual([]);
  });

  it("encontra cliente pela placa do veículo", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({ customerName: "Busca Placa", customerPhone: "48999990011", vehiclePlate: "FFF6G66" });
    const result = await searchByPhoneOrPlate("FFF6G66");
    expect(result?.customer.id).toBe(customer.id);
    expect(result?.matchedVehicleId).toBeDefined();
  });

  it("busca sem correspondência retorna null, nunca inventa um cliente", async () => {
    const result = await searchByPhoneOrPlate("48900000000");
    expect(result).toBeNull();
  });
});

describe("searchCustomersByText", () => {
  it("encontra cliente pelo nome, mesmo com correspondência parcial", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({ customerName: "Fernanda Oliveira", customerPhone: "48999990020", vehiclePlate: "GGG7H77" });
    const results = await searchCustomersByText("fernanda");
    expect(results.map((r) => r.customer.id)).toContain(customer.id);
  });

  it("encontra cliente pela marca/modelo do veículo, mesmo sem o nome bater", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({
      customerName: "Marcos Souza",
      customerPhone: "48999990021",
      vehiclePlate: "HHH8I88",
      vehicleBrand: "Porsche",
      vehicleModel: "Cayenne",
    });
    const results = await searchCustomersByText("cayenne");
    expect(results.map((r) => r.customer.id)).toContain(customer.id);
  });

  it("busca sem correspondência retorna lista vazia, nunca inventa cliente", async () => {
    const results = await searchCustomersByText("nome-que-nao-existe-em-lugar-nenhum");
    expect(results).toEqual([]);
  });
});

describe("fluxo completo de atendimento", () => {
  it("do atendimento até a Ordem de Serviço com status inicial correto", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Fluxo Completo", customerPhone: "48999990020", vehiclePlate: "GGG7H77" });
    const visit = await startAttendance(customer.id, vehicle.id, 42000);

    const diagnostic = await saveEmptyDiagnostic(visit.id, { pintura: { chuvaAcida: "nenhuma", riscos: "media", hologramas: "nenhuma", manchas: "nenhuma" } }, "Cliente relatou uso frequente em estrada.");
    expect(diagnostic.pintura.riscos).toBe("media");

    const recommendation = await addTechnicalRecommendation(visit.id, "polimento", "Riscos leves visíveis na lateral direita.");
    expect(recommendation.category).toBe("polimento");

    const catalog = await fetchServiceCatalog();
    expect(catalog.length).toBeGreaterThan(0);

    await startServiceOrder(visit.id);
    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);
    expect(order.status).toBe("aguardando_execucao");
    expect(order.items).toHaveLength(1);

    const context = await fetchServiceVisitContext(visit.id);
    expect(context?.order?.id).toBe(order.id);
    expect(context?.recommendations).toHaveLength(1);
  });

  it("nunca cria Ordem de Serviço sem nenhum serviço aprovado", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Sem Aprovação", customerPhone: "48999990021", vehiclePlate: "HHH8I88" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await expect(createServiceOrderFromApprovedServices(visit.id, [])).rejects.toThrow();
  });
});

describe("status da Ordem de Serviço", () => {
  it("avança na sequência correta até o status final", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Status", customerPhone: "48999990030", vehiclePlate: "III9J99" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    expect(order.status).toBe("aguardando_execucao");
    const step2 = await advanceServiceOrderStatus(order.id, "aguardando_execucao");
    expect(step2.status).toBe("em_execucao");
    const step3 = await advanceServiceOrderStatus(order.id, "em_execucao");
    expect(step3.status).toBe("aguardando_conferencia");
  });

  it("gerente pode corrigir manualmente para qualquer status", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Correção Manual", customerPhone: "48999990031", vehiclePlate: "JJJ0K00" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);
    const corrected = await setServiceOrderStatus(order.id, "pronto_entrega");
    expect(corrected.status).toBe("pronto_entrega");
  });

  it("não avança além do status final", async () => {
    await expect(advanceServiceOrderStatus("qualquer-id", "entregue")).rejects.toThrow();
  });
});

describe("fetchManagerBoard", () => {
  it("agrupa ordens ativas por status e nunca inclui Entregue nas colunas", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Painel", customerPhone: "48999990040", vehiclePlate: "KKK1L11" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const board = await fetchManagerBoard();
    expect(board.columns.map((c) => c.status)).toEqual([
      "recebido",
      "diagnostico",
      "aguardando_execucao",
      "em_execucao",
      "aguardando_conferencia",
      "pronto_entrega",
    ]);
    const aguardando = board.columns.find((c) => c.status === "aguardando_execucao");
    expect(aguardando?.orders.some((o) => o.customerName === "Painel")).toBe(true);
  });
});

describe("fotos do diagnóstico", () => {
  it("registra a etapa da foto, mas nunca uma url (sem upload real)", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Fotos", customerPhone: "48999990050", vehiclePlate: "LLL2M22" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const diagnostic = await saveEmptyDiagnostic(visit.id);

    const photo = await addDiagnosticPhoto(diagnostic.id, "pintura");
    expect(photo.area).toBe("pintura");
    expect(photo.url).toBeNull();

    const photos = await listDiagnosticPhotos(diagnostic.id);
    expect(photos).toHaveLength(1);
  });
});

describe("fetchOrderDetail", () => {
  it("consolida ordem, visita, cliente, veículo, diagnóstico (com fotos) e recomendações", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Detalhe", customerPhone: "48999990060", vehiclePlate: "MMM3N33" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const diagnostic = await saveEmptyDiagnostic(visit.id, {}, "Observação real");
    await addDiagnosticPhoto(diagnostic.id, "rodas");
    await addTechnicalRecommendation(visit.id, "polimento", null);
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    const order = await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const detail = await fetchOrderDetail(order.id);
    expect(detail?.customer.name).toBe("Detalhe");
    expect(detail?.vehicle.plate).toBe("MMM3N33");
    expect(detail?.diagnostic?.photos).toHaveLength(1);
    expect(detail?.recommendations).toHaveLength(1);
  });

  it("retorna null para uma ordem inexistente, nunca inventa detalhe", async () => {
    expect(await fetchOrderDetail("ordem-que-nao-existe")).toBeNull();
  });
});

describe("fetchHomeSummary", () => {
  it("reflete no faturamento do dia uma ordem criada agora", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Home", customerPhone: "48999990070", vehiclePlate: "NNN4O44" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const summary = await fetchHomeSummary();
    expect(summary.dailyRevenue).toBeGreaterThanOrEqual(catalog[0].defaultPrice ?? 0);
    expect(summary.countsToday.aguardandoAtendimento).toBeGreaterThanOrEqual(1);
  });
});

describe("fetchCustomerTimeline", () => {
  it("traz todas as visitas do cliente com serviços e observações reais", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Timeline Cliente", customerPhone: "48999990080", vehiclePlate: "OOO5P55" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await saveEmptyDiagnostic(visit.id, {}, "Observação da visita.");
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const entries = await fetchCustomerTimeline(customer.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].services).toEqual([catalog[0].name]);
    expect(entries[0].observations).toBe("Observação da visita.");
  });

  it("cliente sem nenhuma visita tem timeline vazia, nunca inventada", async () => {
    const { customer } = await registerQuickCustomerAndVehicle({ customerName: "Sem Visita", customerPhone: "48999990081", vehiclePlate: "PPP6Q66" });
    expect(await fetchCustomerTimeline(customer.id)).toEqual([]);
  });
});

describe("fetchVehicleTimeline", () => {
  it("traz veículo, cliente, linha do tempo e contagem real de fotos", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Timeline Veículo", customerPhone: "48999990090", vehiclePlate: "QQQ7R77" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const diagnostic = await saveEmptyDiagnostic(visit.id);
    await addDiagnosticPhoto(diagnostic.id, "pintura");
    await addDiagnosticPhoto(diagnostic.id, "motor");

    const detail = await fetchVehicleTimeline(vehicle.id);
    expect(detail?.vehicle.id).toBe(vehicle.id);
    expect(detail?.customer.id).toBe(customer.id);
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.totalPhotos).toBe(2);
  });

  it("retorna null para um veículo inexistente, nunca inventa detalhe", async () => {
    expect(await fetchVehicleTimeline("veiculo-que-nao-existe")).toBeNull();
  });
});

describe("fetchDayManagement", () => {
  it("entradas mostram o status atual da ordem, dentro do período pedido", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Gestão do Dia", customerPhone: "48999990100", vehiclePlate: "GDD1A11" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    const { entradas, summary, period } = await fetchDayManagement("hoje");
    expect(period.key).toBe("hoje");
    expect(entradas.some((e) => e.customerName === "Gestão do Dia")).toBe(true);
    expect(summary.countsToday.previstos).toBeGreaterThanOrEqual(1);
  });

  it("separa em execução e prontos por status a partir do mesmo board, sem inventar dados", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Execução Dia", customerPhone: "48999990101", vehiclePlate: "GDD2B22" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const order = await startServiceOrder(visit.id);
    await setServiceOrderStatus(order.id, "em_execucao");

    const { emExecucao, prontos } = await fetchDayManagement("hoje");
    expect(emExecucao.some((o) => o.serviceOrderId === order.id)).toBe(true);
    expect(prontos.some((o) => o.serviceOrderId === order.id)).toBe(false);
  });
});

describe("fetchRecentVehicles", () => {
  it("traz o cliente dono de cada veículo", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Veículo Recente", customerPhone: "48999990102", vehiclePlate: "GDD3C33" });
    const recent = await fetchRecentVehicles(50);
    expect(recent.some((r) => r.vehicle.id === vehicle.id && r.customer.name === "Veículo Recente")).toBe(true);
  });
});

describe("fetchTimelineFeed", () => {
  it("isola entradas de hoje de um período 'ontem', nunca mistura períodos", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Timeline Feed", customerPhone: "48999990103", vehiclePlate: "GDD4D44" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    const hoje = await fetchTimelineFeed("hoje");
    expect(hoje.entries.some((e) => e.customerName === "Timeline Feed")).toBe(true);

    const ontem = await fetchTimelineFeed("ontem");
    expect(ontem.entries.some((e) => e.customerName === "Timeline Feed")).toBe(false);
  });
});

describe("fetchOperationsCenter", () => {
  it("isOperating é true quando há ao menos uma ordem ativa", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Operação Ativa", customerPhone: "48999990104", vehiclePlate: "GDD5E55" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    const center = await fetchOperationsCenter();
    expect(center.isOperating).toBe(true);
    expect(center.atendimentosHoje).toBeGreaterThanOrEqual(1);
  });

  it("separa execução/conferência/prontos e deriva alertas a partir dos mesmos cards", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Operação Conferência", customerPhone: "48999990105", vehiclePlate: "GDD6F66" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    const order = await startServiceOrder(visit.id);
    await setServiceOrderStatus(order.id, "aguardando_conferencia");

    const center = await fetchOperationsCenter();
    expect(center.aguardandoConferencia.some((o) => o.serviceOrderId === order.id)).toBe(true);
    // Acabou de mudar de status agora — não passou dos 30 minutos, não deve gerar alerta.
    expect(center.alerts.some((a) => a.serviceOrderId === order.id)).toBe(false);
  });

  it("timeline inclui o evento de chegada da ordem criada hoje", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Operação Timeline", customerPhone: "48999990106", vehiclePlate: "GDD7G77" });
    const visit = await startAttendance(customer.id, vehicle.id, null);
    await startServiceOrder(visit.id);

    const center = await fetchOperationsCenter();
    expect(center.timeline.some((e) => e.label.includes("Operação Timeline") && e.label.includes("chegou"))).toBe(true);
  });
});
