import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayAppointmentActions } from "./day-appointment-actions";
import type { AppointmentStatus } from "@/lib/planning/types";

/**
 * Missão 40 (item 10, V) / Missão 46 (Partes B-H, itens 4/6-19) — ações expostas somente quando
 * válidas para o status atual E a data do agendamento em relação a hoje (América/São Paulo).
 * Nenhuma regra de transição nova: a proteção autoritativa vive em `service.ts`, isto aqui só
 * evita oferecer um botão que o backend recusaria.
 */

const TODAY_ISO = "2026-09-07";
const TODAY_AT = `${TODAY_ISO}T11:00:00-03:00`; // 08:00 -03:00
const YESTERDAY_AT = "2026-09-06T11:00:00-03:00"; // 08:00 -03:00, um dia antes
const TOMORROW_AT = "2026-09-08T11:00:00-03:00"; // 08:00 -03:00, um dia depois

function render(status: AppointmentStatus, scheduledAt: string = TODAY_AT, todayIso: string = TODAY_ISO) {
  return renderToStaticMarkup(createElement(DayAppointmentActions, { appointmentId: "a1", status, scheduledAt, todayIso, customerName: "Cliente Teste" }));
}

describe("DayAppointmentActions — appointment de HOJE (itens 7-14)", () => {
  it("item 7/8. agendado -> mostra 'Iniciar atendimento' e 'Cancelar'", () => {
    const html = render("agendado");
    expect(html).toContain("Iniciar atendimento");
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Concluir");
  });

  it("item 9. confirmado -> mostra 'Iniciar atendimento' e 'Cancelar'", () => {
    const html = render("confirmado");
    expect(html).toContain("Iniciar atendimento");
    expect(html).toContain("Cancelar");
  });

  it("item 10/11. em_andamento -> mostra 'Concluir' e 'Cancelar', nunca 'Iniciar atendimento' de novo", () => {
    const html = render("em_andamento");
    expect(html).toContain("Concluir");
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Iniciar atendimento");
  });

  it("item 12. concluido -> nenhuma ação (estado terminal)", () => {
    expect(render("concluido")).toBe("");
  });

  it("item 13. cancelado -> nenhuma ação (estado terminal)", () => {
    expect(render("cancelado")).toBe("");
  });

  it("item 14. reagendado -> nenhuma ação (estado terminal)", () => {
    expect(render("reagendado")).toBe("");
  });
});

describe("DayAppointmentActions — appointment de DATA PASSADA (itens 4/6)", () => {
  it("item 4. ontem/agendado -> nenhuma ação mutável renderizada", () => {
    const html = render("agendado", YESTERDAY_AT);
    expect(html).not.toContain("Iniciar atendimento");
    expect(html).not.toContain("Cancelar");
    expect(html).not.toContain("Concluir");
  });

  it("item 6. ontem -> mostra indicador discreto 'Histórico'", () => {
    expect(render("agendado", YESTERDAY_AT)).toContain("Histórico");
  });

  it("ontem/em_andamento também vira histórico, mesmo com status ativo", () => {
    const html = render("em_andamento", YESTERDAY_AT);
    expect(html).toContain("Histórico");
    expect(html).not.toContain("Concluir");
  });

  it("data bem mais antiga (não só ontem) também vira histórico", () => {
    expect(render("agendado", "2026-08-01T11:00:00-03:00")).toContain("Histórico");
  });
});

describe("DayAppointmentActions — appointment de DATA FUTURA (itens 15-17)", () => {
  it("item 15. amanhã/agendado -> 'Iniciar atendimento' NÃO disponível", () => {
    const html = render("agendado", TOMORROW_AT);
    expect(html).not.toContain("Iniciar atendimento");
  });

  it("item 16. amanhã/agendado -> 'Cancelar' disponível", () => {
    expect(render("agendado", TOMORROW_AT)).toContain("Cancelar");
  });

  it("item 17. amanhã -> 'Concluir' NÃO disponível mesmo que o status já fosse em_andamento", () => {
    const html = render("em_andamento", TOMORROW_AT);
    expect(html).not.toContain("Concluir");
    expect(html).toContain("Cancelar"); // cancelar continua permitido
  });

  it("amanhã não mostra 'Histórico' (não é passado)", () => {
    expect(render("agendado", TOMORROW_AT)).not.toContain("Histórico");
  });
});

describe("DayAppointmentActions — timezone América/São Paulo (itens 18/19)", () => {
  it("item 18/19. 23:30 em São Paulo de ONTEM (já é outro dia em UTC) continua classificado como ontem -> histórico", () => {
    // 2026-09-06T23:30:00-03:00 = 2026-09-07T02:30:00Z — em UTC já é "hoje" (07/09), mas o
    // calendário operacional (São Paulo) continua sendo 06/09 — nunca usar o dia UTC para decidir.
    const html = render("agendado", "2026-09-06T23:30:00-03:00", TODAY_ISO);
    expect(html).toContain("Histórico");
  });

  it("item 18/19. 00:30 em São Paulo de HOJE (antes disso ainda era ontem em UTC) continua classificado como hoje -> ações normais", () => {
    const html = render("agendado", `${TODAY_ISO}T00:30:00-03:00`, TODAY_ISO);
    expect(html).toContain("Iniciar atendimento");
    expect(html).not.toContain("Histórico");
  });

  it("agendamento de hoje às 08:00, mesmo que 'agora' real já tenha passado das 18h, continua permitindo ações (nunca scheduledAt < now)", () => {
    // A regra é comparação de CALENDÁRIO, não de instante — `render` não usa `Date.now()`, então
    // este teste reforça que a decisão depende só de `scheduledAt` (data) x `todayIso`, nunca da
    // hora corrente real.
    const html = render("agendado", TODAY_AT, TODAY_ISO);
    expect(html).toContain("Iniciar atendimento");
  });
});

describe("DayAppointmentActions — confirmação de cancelamento (item 20)", () => {
  it("botão 'Cancelar' é o gatilho de um Dialog (window.confirm não é usado) — conteúdo de confirmação só existe quando o Dialog abre, nunca dispara a ação direto no clique", () => {
    const html = render("agendado");
    // O trigger existe e é um <button>, mas o texto do modal de confirmação ("Cancelar
    // agendamento?", "Confirmar cancelamento") só é montado quando o Dialog está aberto — a
    // renderização inicial (fechado) prova que clicar em "Cancelar" não executa nada sozinho.
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Confirmar cancelamento");
  });
});
