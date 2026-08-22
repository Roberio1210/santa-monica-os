/**
 * Missão Z3 (base de conhecimento do Zézinho) — dados institucionais (categoria C da missão):
 * relativamente estáveis, confirmados pelo gestor diretamente na missão (2026-08-23). Fonte
 * única — nunca duplicar estes valores em outro lugar do código (ex.: `configuracoes/page.tsx`
 * foi atualizado para importar daqui em vez de ter os mesmos dados hardcoded soltos).
 *
 * Divergência encontrada e reportada (não sobrescrita silenciosamente): a página de
 * Configurações já tinha "Sta Monica Estética Automotiva" como nome hardcoded — o nome oficial
 * confirmado nesta missão é "Estética Automotiva e Estacionamento Sta. Mônica". Adotado o nome
 * confirmado nesta missão (fonte mais recente e explícita do gestor); ver relatório final.
 */
export const COMPANY_INFO = {
  name: "Estética Automotiva e Estacionamento Sta. Mônica",
  neighborhood: "Santa Mônica",
  city: "Florianópolis",
  state: "SC",
  address: "Rua Vereador Guido Bott, 250, Santa Mônica, Florianópolis — SC",
  whatsapp: "(48) 99174-1102",
  instagram: "@estetica.automotiva.sta.monica",
  website: "esteticastamonica.com.br",
  businessHours: {
    weekdays: "Segunda a sexta, 08:00 às 18:00",
    saturday: "Sábado, 08:00 às 14:00",
    sunday: "Fechado",
  },
} as const;
