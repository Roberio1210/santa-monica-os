# Arquitetura Zézinho 4.0 — Gerente Operacional (consciência situacional + clima + antecipação)

Documento de arquitetura (sem implementação), preparado em 20/07/2026 para revisão antes do
início da Sprint "Gerente Operacional 4.0". Nenhum código foi alterado para produzir este
documento — é leitura do estado atual (pipeline 3.0 + módulos vizinhos) + proposta.

## 1. O que está mudando

O Zézinho 3.0 já pensa (intenção → objetivo → memória → planner → ferramentas → raciocínio →
narrador) e já fala como gerente em vez de relatório. O que falta é o que um gerente de verdade
tem e o pipeline atual não tem: **noção de quando ele está**. Hoje, se você perguntar "como está
nosso dia?" às 8h10, o pipeline monta a mesma comparação de período que montaria às 17h — não
existe nenhum conceito de "ainda é cedo, a amostra é pequena, não dá pra concluir nada ainda".

4.0 acrescenta três coisas novas ao pipeline existente, sem reescrevê-lo:

1. **Consciência situacional** — antes de raciocinar sobre qualquer pergunta operacional, saber
   que horas são, que dia da semana é, e em que estágio do expediente a operação está. Isso não é
   uma "ferramenta" que o planner escolhe chamar — é uma moldura que roda sempre e que o
   raciocínio (Etapa 4) consulta para decidir se uma comparação faz sentido agora.
2. **Previsão do tempo em tempo real** — uma integração externa nova (primeira do Zézinho que não
   é um sistema interno), seguindo o mesmo padrão já usado para JumpPark: client + service +
   configuração via variável de ambiente + estado "não configurado" honesto quando não há chave.
3. **Narração proativa** — para perguntas de status/expectativa, a resposta deixa de ser "só o
   que foi perguntado" e passa a antecipar o que um gerente mencionaria sem precisar ser
   perguntado (situação, clima, meta, alerta, oportunidade, recomendação) — mas continua enxuta
   para as outras intenções (recomendação, diagnóstico, decisão), que já funcionam bem hoje.

Nenhuma dessas três coisas troca o pipeline 3.0 — elas entram como uma nova camada 0 (situacional),
uma nova ferramenta no catálogo (clima), uma nova ferramenta de agregação histórica, e uma
intenção nova (`outlook`) para perguntas de expectativa que hoje não têm um formato de resposta
correto.

## 2. Estado real hoje (o que existe, o que não existe)

| Necessidade do pedido | Status | Fonte / observação |
| --- | --- | --- |
| Horário atual, dia da semana | Trivial — já disponível | `SAO_PAULO_TZ`, `saoPauloDateISO()` (timezone.ts) |
| Estágio operacional do dia (abertura/manhã/pico/tarde/fechamento) | **Não existe** | Precisa do horário de funcionamento real da loja — não documentado em lugar nenhum do projeto (ver seção 13, pergunta 1) |
| Ordens finalizadas do dia | Real | `fetchOperationalOrders` (já usado por `jumppark_period_summary`) |
| **Ordens abertas / em execução / veículos no pátio** | **Investigado e confirmado indisponível** | `docs/jumppark-open-orders-investigation.md` (10/07/2026): os dois únicos endpoints do JumpPark usados pelo projeto nunca retornam ordem sem `exitDateTime` — 1.708 ordens amostradas, 100% já finalizadas. Não há endpoint confiável para isso hoje. Não vou reabrir essa investigação sem um endpoint novo para testar. |
| Agenda do dia | **Mock** | `src/data/mock/schedule.ts` — sem mudança nesta sprint (fora do escopo autorizado) |
| Metas diárias e mensais | **Não existe** | Nenhuma tabela, nenhum conceito de meta de negócio armazenado em lugar nenhum (confirmado na auditoria da Sprint 3.0 e reconfirmado agora) |
| Histórico do mesmo dia da semana / tendência de horário | **Não existe como ferramenta, mas é computável** | `fetchOperationalOrders` já aceita qualquer intervalo — falta só a agregação por dia-da-semana/hora, que é lógica nova sobre dado real, não uma integração nova |
| Alertas ativos | Real | `central_alerts` (Sprint 3.0) |
| Fluxo de caixa, DRE | Real | `cash_ledger_totals`, `dre_result` (Sprint 3.0) |
| Clientes recorrentes / CRM | Real | `crm_customers` (Sprint 3.0) |
| Estoque | Real | `inventory_overview` (Sprint 3.0) |
| **Previsão do tempo** | **Não existe** | Nenhuma integração, nenhuma chave, nenhum client — sprint nova |

Duas lacunas [pátio em tempo real, metas] não têm solução limpa dentro do que já existe — a
seção 13 traz as perguntas que preciso da sua decisão antes de implementar qualquer coisa que
dependa delas.

## 3. Camada 0 — Contexto Situacional (novo)

Roda **sempre**, antes do planner, para qualquer pergunta que passe pelo pipeline novo (não é
uma ferramenta escolhida — é dado de entrada de graça, computado localmente, sem I/O).

```
SituationalContext {
  now: Date;
  weekday: "segunda" | ... | "domingo";
  stage: "pre_abertura" | "abertura" | "manha" | "pico_almoco" | "tarde" | "fechamento" | "fechado";
  minutesSinceOpen: number | null;     // null quando fechado/pré-abertura
  sampleConfidence: "insuficiente" | "parcial" | "completa";  // guia o raciocínio (seção 8)
}
```

`stage` e `sampleConfidence` dependem do horário de funcionamento real da loja, que preciso que
você confirme (seção 13, pergunta 1) — vou propor um valor padrão (8h–18h, seg–sáb) só para não
travar o desenho, mas é a primeira coisa a corrigir se estiver errado.

`sampleConfidence` é o mecanismo que resolve o exemplo do pedido: às 8h10, com `minutesSinceOpen`
pequeno, é `"insuficiente"` — e o raciocínio (Etapa 4) sabe que não deve rodar uma comparação de
dia inteiro contra ontem, só reportar o que já existe (ordens finalizadas até agora, se houver) e
usar o padrão histórico do mesmo horário como referência (seção 5), não o dia inteiro anterior.

## 4. Nova integração — Previsão do Tempo

Segue exatamente o padrão já estabelecido para JumpPark e para o provedor de IA opcional
(`ai-provider.ts`): client + service + configuração por variável de ambiente, nunca uma chave
real no código, estado "não configurado" honesto quando ausente.

```
src/lib/integrations/weather/
  client.ts     chamada HTTP real (fetch com timeout) ao provedor escolhido
  service.ts    fetchWeatherForecast(): Promise<WeatherForecastResult>
  types.ts      WeatherForecastResult { configured, error, today: DayForecast, tomorrow: DayForecast | null }
```

`isWeatherConfigured()` (em `src/lib/config/env.ts`, ao lado de `isJumpParkConfigured()`) lê
`WEATHER_API_KEY` e `WEATHER_LOCATION` (cidade ou lat/long — precisa da sua confirmação, seção 13
pergunta 3) do ambiente. Sem chave configurada, `fetchWeatherForecast()` devolve
`{configured: false, error: "Previsão do tempo não configurada neste ambiente."}` — o resto do
pipeline já sabe lidar com isso (mesmo padrão de gap honesto do JumpPark).

Registrado no catálogo (Z2 da Sprint 3.0) como uma nova ferramenta:

```
weather_forecast: {
  reuses: "fetchWeatherForecast (novo, src/lib/integrations/weather/service.ts)",
  requiresPeriod: false,
  costHint: "low",
}
```

### Seletividade (regra explícita do pedido)

O clima só é buscado quando a pergunta toca operação, movimento esperado, planejamento,
faturamento ou estratégia — nunca para estoque, nunca para clientes isolados. Implementado como
extensão da tabela `OBJECTIVE_TOOLS` do planner (já existente): `weather_forecast` entra na lista
de ferramentas de `business_health`, do objetivo novo `demand_outlook` (seção 6) e é **adicionado
condicionalmente** a `improve_service_mix`/`evaluate_pricing`/`staffing_capacity` só quando a
intenção for `outlook` ou `status_check` (perguntas de planejamento/expectativa) — nunca para
`client_retention`, `reduce_costs` com tópico estoque, ou `evaluate_pricing` fora de contexto de
planejamento. A tabela completa fica explícita em código, revisável em PR, igual às tabelas já
existentes.

## 5. Nova ferramenta — Padrão histórico (mesmo dia da semana / tendência de horário)

Não é uma integração nova — é agregação nova sobre dado que já é buscado. Vive junto dos outros
agregadores de JumpPark:

```
src/lib/integrations/jumppark/historical-pattern.ts
  computeSameWeekdayPattern(orders: OperationalOrder[], referenceDate): {
    typicalRevenue: number;
    typicalVehicles: number;
    typicalTicket: number | null;
    sampleWeeks: number;             // quantas ocorrências desse dia da semana entraram na amostra
    peakHourHistogram: { hour: string; share: number }[];  // distribuição típica de movimento por hora
  }
```

Busca **uma vez** um intervalo maior (ex.: últimas 8–12 semanas, um único `fetchOperationalOrders`)
e agrega em memória — não dispara uma chamada por semana. Registrado no catálogo como ferramenta
`historical_pattern` (`requiresPeriod: false`, usa a data de hoje internamente).

Esse "típico do dia/hora" é o que substitui a ideia de "meta" quando não existe meta configurada
de verdade (ver pergunta 2, seção 13): em vez de "nossa meta é R$ X", o Zézinho pode dizer
"mantendo o ritmo histórico das segundas-feiras, o esperado até agora seria Y" — uma frase
fundamentada em dado real, não uma meta inventada.

## 6. Nova intenção — `outlook`

"O que você espera dessa semana?" e "como vai ser nosso dia?" não são `compare` (o pedido
explicitamente rejeita responder só comparando períodos passados) nem `diagnose` (não é sobre uma
causa de um problema) — são pedido de **expectativa**, uma categoria que não existe na taxonomia
atual (`diagnose`, `recommend`, `evaluate_decision`, `explain`, `compare`, `inform`,
`status_check`, `clarify_needed`).

`outlook` (nova, 9ª categoria) — reconhecida por padrões como "o que você espera", "como vai ser",
"vamos ter um bom dia/semana", "previsão para hoje/essa semana" — combina histórico
(`historical_pattern`), clima (`weather_forecast`), alertas (`central_alerts`) e, quando a
pergunta for sobre hoje especificamente, o contexto situacional (seção 3).

`status_check` ("como está nosso dia?") deixa de ser um atalho que só chama `generateDailySummary`
(como ficou na integração Z4 da Sprint 3.0) e passa a rodar pelo pipeline completo com o contexto
situacional acoplado — é a mudança que resolve o exemplo do pedido (8h10 → "ainda é cedo", não
"caiu 100%").

## 7. Objetivo novo — `demand_outlook`

Objetivo (Etapa 2) associado a `outlook` e a `status_check` sem entidade específica: "entender o
movimento esperado para tomar decisões operacionais". Ferramentas mínimas:
`historical_pattern` + `weather_forecast` + `central_alerts`, mais o contexto situacional (sempre
presente, não é uma ferramenta). `OBJECTIVE_DATA_AVAILABILITY` marca `demand_outlook` como `real`
(histórico e alertas são reais) — o clima entra como fonte real também quando configurado, e como
gap honesto quando não.

## 8. Raciocínio situacional (Etapa 4 — extensão)

Uma regra nova na composição de achados: quando `sampleConfidence === "insuficiente"`
(ver seção 3), o raciocínio **não** gera um achado do tipo "faturamento caiu X%" comparando o dia
de hoje (poucos minutos) contra um dia inteiro anterior — isso é comparação estatisticamente sem
sentido e é exatamente o erro que o pedido aponta. Em vez disso:

- se `stage` for `pre_abertura`/`abertura`: nenhuma comparação de faturamento é tentada; o
  raciocínio relata só contagens absolutas do que já existe (ordens finalizadas até agora, se
  houver) e usa `historical_pattern` como referência ("normalmente a esta hora já tivemos N
  atendimentos"), nunca um "caiu X%".
- do meio da manhã em diante (`sampleConfidence !== "insuficiente"`), comparações voltam a fazer
  sentido normalmente, exatamente como já funciona hoje.

Isso é uma regra a mais na tabela de achados (`findings.ts`, já existente) — condicionada ao
`SituationalContext`, que passa a ser parte do `ReasoningInput` (Etapa 4) ao lado de
intenção/objetivo/entidades/memória/resultados das ferramentas.

## 9. Risco e oportunidade explícitos (extensão do `ReasoningResult`)

O pedido quer frases como "o maior risco desta semana é..." e "a melhor oportunidade é...".
Hoje `ReasoningResult` tem `recommendations[].risk` (string livre, dentro de cada recomendação) —
suficiente para `evaluate_decision`, mas não para `outlook`, que precisa apontar **um** risco e
**uma** oportunidade centrais da semana/dia, não por recomendação. Proposta: dois campos novos,
opcionais, computados só quando o objetivo é `demand_outlook`:

```
ReasoningResult {
  ...
  topRisk: string | null;         // "O maior risco desta semana é a mudança de tempo prevista para quarta."
  topOpportunity: string | null;  // "A melhor oportunidade é hoje, com tempo firme — bom dia para vitrificação e cristalização."
}
```

Derivados por uma regra pequena e nova em `reasoning/` cruzando clima + histórico + alertas — ex.:
tempo bom hoje/amanhã + capacidade disponível (via `historical_pattern`) → oportunidade; mudança
de tempo prevista + dependência histórica de lavação no faturamento → risco. Nunca opinião sem
dado por trás — mesma regra de todo o resto do pipeline.

## 10. Narrador proativo (Etapa 5 — extensão, só para `status_check`/`outlook`)

As outras 7 intenções continuam exatamente como estão hoje (curtas, um formato por intenção,
já aprovadas na Sprint 3.0). Só `status_check` e `outlook` ganham um formato novo — um "briefing"
de várias seções curtas, montado por uma função nova (`narrator/briefing.ts`), na ordem: situação
atual (com a moldura do estágio operacional) → clima (quando disponível) → movimento
esperado/típico → meta (histórica, nunca inventada) → alertas relevantes → oportunidade → risco →
recomendação prática. Cada seção só aparece se houver dado real por trás — igual a
`generateDailySummary` já faz hoje, só que agora dentro do pipeline novo, com clima e histórico
somados.

## 11. O que NÃO muda (guardrails mantidos)

- Somente leitura, sem IA generativa obrigatória, nunca inventar dado — clima "não configurado" e
  metas "não existem" são ditos honestamente, nunca aproximados sem rótulo.
- `intent/`, `objective/`, `memory/`, `tools/`, `planner/`, `reasoning/`, `narrator/` da Sprint 3.0
  não são redesenhados — 4.0 adiciona módulos e entradas de tabela, não reescreve o que já existe.
- Reaproveitamento total: `fetchOperationalOrders` é a mesma função de sempre; o histórico é só
  uma agregação nova sobre ela.
- Nenhuma alteração em Financeiro, Estoque ou JumpPark além do necessário (nenhuma, nesta sprint —
  tudo que 4.0 precisa desses módulos já existe).
- As 7 intenções antigas continuam com a resposta enxuta que já têm — o "briefing" proativo é
  scoped só a `status_check`/`outlook`, não vira o padrão geral (evita "despejo" nas outras).

## 12. Mapa de módulos (arquivos, sem código)

```
src/lib/integrations/weather/         NOVO — client.ts, service.ts, types.ts
src/lib/integrations/jumppark/
  historical-pattern.ts               NOVO — computeSameWeekdayPattern (agregação pura)
src/lib/zezinho/
  situational/                        NOVO
    stage.ts                          computeOperationalStage(now) -> SituationalContext
    types.ts
  intent/types.ts                     + "outlook" em ZezinhoIntent
  intent/classify.ts                  + padrões de expectativa
  objective/types.ts                  + "demand_outlook"
  objective/infer.ts                  + regra outlook/status_check -> demand_outlook
  tools/registry.ts                   + weather_forecast, + historical_pattern
  tools/executor.ts                   + runWeatherForecast, + runHistoricalPattern
  planner/selectTools.ts              + entradas de demand_outlook, regra de seletividade de clima
  reasoning/types.ts                  + topRisk, + topOpportunity no ReasoningResult
  reasoning/facts.ts                  + fatos de clima/histórico
  reasoning/findings.ts               + regra de amostra insuficiente (situacional)
  reasoning/reason.ts                 recebe SituationalContext no ReasoningInput
  narrator/briefing.ts                NOVO — formato proativo multi-seção
  narrator/narrate.ts                 + roteia outlook/status_check para briefing.ts
  service.ts                          status_check sai do atalho antigo (generateDailySummary
                                       direto), passa pelo pipeline; outlook entra na mesma cadeia
```

## 13. Perguntas em aberto (preciso da sua decisão antes de começar)

1. **Horário de funcionamento real da loja** — não está documentado em lugar nenhum do projeto.
   Preciso dos dias e horários reais (ex.: seg–sáb 8h–18h?) para o estágio operacional
   (`abertura`/`pico`/`fechamento`) ser correto. Vou usar 8h–18h seg–sáb como padrão até você
   confirmar ou corrigir.
2. **Metas diárias/mensais** — não existe esse conceito no sistema hoje. Duas opções:
   (a) criar uma tabela pequena para você configurar metas reais (schema novo, fora do "não
   alterar banco" costumeiro das últimas sprints, mas seria a única forma de ter uma "meta" de
   verdade); ou (b) usar só o histórico do mesmo dia da semana como referência informal ("ritmo
   histórico"), sem chamar isso de meta. Recomendo (b) para esta sprint — mais rápido, zero risco
   de banco — e deixar (a) para uma sprint futura se você quiser metas configuráveis de verdade.
3. **Provedor de previsão do tempo e localização** — OpenWeather, WeatherAPI ou outro? Preciso que
   você (ou eu, depois de você aprovar) cadastre a chave como variável de ambiente
   (`WEATHER_API_KEY`) — nunca vou colocar uma chave real no código. Preciso também da localização
   (cidade "Florianópolis" resolve, ou prefere lat/long fixos do endereço da loja?).
4. **"Veículos no pátio" / "ordens abertas"** — confirmado indisponível pela investigação de
   10/07/2026 (seção 2). Não vou tentar resolver isso nesta sprint a menos que você tenha uma
   pista nova (outro endpoint, outra credencial JumpPark) para eu investigar.
5. **Checkpoints** — proponho o mesmo formato Z1–Z4 das sprints anteriores:
   - Z1: contexto situacional + integração de clima (client/service) + ferramenta no catálogo.
   - Z2: ferramenta de padrão histórico + intenção `outlook` + objetivo `demand_outlook` + planner
     (seletividade de clima).
   - Z3: raciocínio situacional (amostra insuficiente) + risco/oportunidade explícitos.
   - Z4: narrador proativo (briefing) + integração em `service.ts` (status_check sai do atalho) +
     testes da conversa do pedido + deploy.

Nenhuma implementação foi iniciada. Aguardando sua validação nas 5 perguntas acima (em especial
1–3, que bloqueiam Z1) antes de começar.
