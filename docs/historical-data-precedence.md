# Precedência de fontes históricas — Planilha × JumpPark

**Status:** decisão definitiva, confirmada pelo gestor em 11/08/2026.
**Constante no código:** `DATA_CORTE_JUMPPARK` em `src/lib/config/historical-source-precedence.ts` — única fonte de verdade; nunca redeclarar essa data em outro arquivo.

## Regra

- **Antes de 2026-05-01:** a **planilha histórica** (lavação e estacionamento) é a fonte oficial.
- **A partir de 2026-05-01 (inclusive):** o **JumpPark** é a fonte oficial **exclusiva**.
- Havendo divergência entre as duas fontes no período coberto pelo JumpPark, o **JumpPark sempre prevalece** — a planilha nunca complementa nem corrige esse período.
- Nenhum registro das duas fontes pode ser somado no mesmo período (risco de dupla contagem).
- Nenhuma aproximação de serviço não identificável com segurança — casos ambíguos ficam pendentes, nunca mapeados por preço ou suposição.

## Auditoria que fundamentou o corte

Auditoria dia a dia do JumpPark em maio/2026 (Neon de produção, `jumppark_service_orders`, `exit_time is not null`):

- 30 dos 31 dias de maio têm ordens reais registradas (único dia sem registro: 10/05, isolado — 9 dias seguidos de uso antes, 21 dias seguidos depois).
- Volume diário já oscila na mesma faixa (5 a 38 ordens/dia) do primeiro ao último dia do mês — nenhum padrão de "rampa de adoção" visível dentro de maio.
- Não existe, nos dados, nenhum sinal técnico (campo `source`, situação, ou volume) que distinga um período de teste dentro de maio — o mês inteiro se comporta de forma homogênea desde o dia 1.

**Conclusão da auditoria:** não há evidência nos dados para justificar um corte posterior ao dia 1º de maio dentro do próprio mês. O gestor confirmou que maio/2026 é de fato quando o JumpPark passou a representar a operação real — descartando explicitamente março e abril como fonte oficial, mesmo havendo registros `source='jumppark'` no Neon para esses meses (ver seção "Módulos existentes" abaixo — esses registros existem e continuam no Neon, mas não devem ser tratados como a fonte oficial de histórico para jan–abr).

## O que isso significa na prática

| Período | Fonte oficial | Como alimentar |
|---|---|---|
| 01/01/2026 – 30/04/2026 | Planilha histórica | Importação futura (Etapa 2/3 da missão), origem marcada como `historical_spreadsheet` |
| A partir de 01/05/2026 | JumpPark | Já sincronizado em `jumppark_service_orders`/`jumppark_service_order_items` (origem `jumppark`) |

Isso **não apaga** os registros JumpPark de março/abril já existentes no Neon — eles continuam lá, intactos (nunca alteramos dado histórico real). Só deixam de ser a fonte usada para compor o histórico oficial desse período em qualquer relatório/consolidação futura.

## Como o sistema evita dupla contagem

1. **Uma única constante, um único ponto de decisão:** `officialHistoricalSource(date)` em `src/lib/config/historical-source-precedence.ts` decide a fonte para qualquer data — nunca duas rotinas diferentes decidindo isso de formas divergentes.
2. **Futuras rotinas de importação da planilha** (ainda não implementadas) devem filtrar `date < DATA_CORTE_JUMPPARK` antes de gravar qualquer registro — nunca importar uma data igual ou posterior ao corte.
3. **Futuras rotinas de consolidação/histórico** devem ler a planilha só para `date < DATA_CORTE_JUMPPARK` e o JumpPark só para `date >= DATA_CORTE_JUMPPARK` — nunca as duas fontes para a mesma data, nunca somadas.
4. **Módulos de consumo teórico automático** (`historical_theoretical_consumption`, `AUTOMATIC_CONSUMPTION_ACTIVATED_AT`) precisarão ser reprocessados para excluir mar/abr do JumpPark quando a consolidação da planilha for implementada — ver seção abaixo.

## Módulos existentes que precisarão de ajuste

Auditado em 11/08/2026 — módulos que hoje leem `jumppark_service_orders`/`jumppark_service_order_items` **sem** filtrar por `DATA_CORTE_JUMPPARK`:

- **`src/lib/jumppark-orders/historical-theoretical-consumption.ts`** (Missão de Histórico Retroativo) — hoje processa TODO o período sincronizado, incluindo março/abril. Já gravou 882 linhas reais em `historical_theoretical_consumption`, das quais uma parte é de março/abril. **Precisará ser reprocessado** (nunca simplesmente apagado — a tabela já é auditável por `order_date`) para desconsiderar mar/abr como fonte JumpPark assim que a planilha desse período for consolidada.
- **`src/app/estoque/consumo-teorico-historico/page.tsx`** — herda o mesmo problema por consumir os dados acima.
- **`src/lib/integrations/jumppark/servicesQuery.ts`, `vehiclesQuery.ts`, `customersQuery.ts`, `customersRefresh.ts`, `vehicleServiceProfile.ts`, `customerServiceProfile.ts`, `ordersQuery.ts`** — todo o módulo de Serviços/Clientes/Veículos/CRM (Dashboard, `/ordens/servicos`, `/crm`, `/ordens/clientes`, `/ordens/veiculos`) hoje calcula estatísticas "vitalícias"/histórico usando o JumpPark sem excluir mar/abr. **Fora do escopo desta auditoria** (não alterado agora, conforme instrução explícita de não iniciar outra fase) — precisará da mesma regra de precedência quando a consolidação for implementada.

Nenhum código foi alterado para aplicar o filtro ainda — esta seção é só o mapeamento do que precisará mudar quando as Etapas 2–4 da missão forem executadas.

## Arquivos de planilha necessários

Ainda não recebidos. Necessários para completar 01/01/2026–30/04/2026:

1. **Planilha histórica de lavação** — data, cliente, veículo, placa (quando disponível), tipo de lavação/serviço, valor, adicionais, descontos, total, forma de pagamento.
2. **Planilha histórica de estacionamento** — totais reais por dia (crédito/débito/Pix/dinheiro), ou granularidade maior se disponível. Sem inventar veículos/clientes/tickets individuais quando só houver totais.
