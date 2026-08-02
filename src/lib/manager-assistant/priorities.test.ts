import { describe, expect, it } from "vitest";
import { derivePriorities } from "@/lib/manager-assistant/priorities";

const ZERO = { aguardandoExecucao: 0, execucaoAtrasada: 0, aguardandoConferencia: 0, prontos: 0, diagnosticoPendente: 0, ordensSemValor: 0 };

describe("derivePriorities", () => {
  it("nunca mostra uma categoria zerada — sem frases genéricas", () => {
    const priorities = derivePriorities({ ...ZERO, aguardandoConferencia: 3 });
    expect(priorities).toHaveLength(1);
    expect(priorities[0].id).toBe("aguardando_conferencia");
    expect(priorities[0].label).toContain("3");
  });

  it("nunca ultrapassa 7 prioridades", () => {
    const priorities = derivePriorities({ aguardandoExecucao: 1, execucaoAtrasada: 1, aguardandoConferencia: 1, prontos: 1, diagnosticoPendente: 1, ordensSemValor: 1 });
    expect(priorities.length).toBeLessThanOrEqual(7);
  });

  it("cada prioridade leva a um registro de origem real, nunca uma âncora vazia", () => {
    const priorities = derivePriorities({ ...ZERO, ordensSemValor: 2 });
    expect(priorities[0].href).toMatch(/^\//);
  });

  it("quando tudo está zerado, não retorna nenhuma prioridade", () => {
    expect(derivePriorities(ZERO)).toEqual([]);
  });
});
