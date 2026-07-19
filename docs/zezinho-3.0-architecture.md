# Arquitetura Zézinho 3.0 — de motor de consultas a gerente operacional

Documento de arquitetura (sem implementação), preparado em 19/07/2026 para revisão conjunta antes
do início da Sprint Zézinho 3.0. Nenhum código deste sprint foi alterado para produzir este
documento — é só leitura do estado atual + proposta.

## 1. O que está mudando

Zézinho 2.0 é um **motor analítico**: recebe uma pergunta, decide qual template de comparação
rodar, busca os números, formata uma frase. Ele responde bem a "compare X com Y", mas continua
pensando como relatório — mesmo quando a resposta é gerencial (ex.: as recomendações da sprint
anterior), o caminho até ela é "casa uma frase-gatilho → roda uma comparação → preenche um
template".

Zézinho 3.0 muda o que ele **é**: em vez de rotear direto para uma resposta, toda pergunta passa
por um pipeline de raciocínio de 5 etapas — entender o que a pessoa realmente quer, entender por
quê, buscar só o necessário, raciocinar sobre os fatos, e só então falar. A saída deixa de ser um
template preenchido e passa a ser a conclusão desse raciocínio, narrada como um gerente falaria.

Isso não é uma reescrita total: a base factual de 2.0 (interpretador de datas, funções de
agregação por domínio — JumpPark, Fluxo de Caixa, DRE, Estoque) continua sendo a única fonte de
números. O que muda é a camada entre "pergunta" e "números" (que hoje é uma cadeia de `if`s em
`service.ts`) e a camada entre "números" e "resposta" (que hoje é um template com seções fixas
tipo relatório).

## 2. Estado real hoje (o que existe, o que é mock, o que não existe)

Para o pipeline de raciocínio não prometer nada que não pode cumprir, isto é o que está
efetivamente disponível como dado real, hoje, no repositório:

| Domínio | Status | Fonte |
| --- | --- | --- |
| Operação (lavação/estacionamento, JumpPark) | **Real** | `src/lib/integrations/jumppark/*` |
| Financeiro (caixa, DRE, contas a pagar/receber) | **Real** | `src/lib/finance/service.ts` |
| Estoque | **Real** | `src/lib/inventory/service.ts` (`fetchInventoryOverview`) |
| Clientes/CRM | **Parcial** — agregador real existe (`src/lib/crm/service.ts`, `fetchCrmCustomers`), mas **nada o consome ainda** (nem a página `/clientes`, nem o Zézinho) | `src/lib/crm/*` |
| Equipe/RH | **Não existe** — só schema de tabela e um doc de arquitetura, zero dado, zero service | `src/db/schema/hr.ts`, `docs/hr-module-architecture.md` |
| Marketing | **Mock** | `src/data/mock/marketing.ts` |
| Agenda | **Mock** | `src/data/mock/schedule.ts` |
| Metas/histórico de metas | **Não existe** — nenhum conceito de meta de negócio armazenado em lugar nenhum | — |

Consequência direta para a arquitetura: o pipeline de raciocínio precisa ser **honesto por
construção** sobre isso. Quando uma pergunta toca equipe, agenda, marketing ou metas, a etapa de
raciocínio (seção 8) deve emitir explicitamente um "gap" ("não tenho esse dado ainda") em vez de
silenciosamente ignorar a pergunta ou responder só com o que sobrou. Isso é o mesmo princípio já
usado em 2.0 (nunca inventar número), só que agora aplicado também a domínios inteiros, não só a
métricas.

## 3. O pipeline de raciocínio (visão geral)

```
texto do usuário + memória da sessão
        │
        ▼
 [1] INTENÇÃO ──────────► o que a pessoa quer (diagnosticar / recomendar / avaliar / comparar / explicar / informar)
        │
        ▼
 [2] OBJETIVO OCULTO ───► por que ela quer isso (aumentar faturamento / reduzir custo / corrigir mix / etc.)
        │
        ▼
 [3] BUSCA SELETIVA ────► só as ferramentas necessárias para ESSE objetivo, não tudo
        │
        ▼
 [4] RACIOCÍNIO INTERNO ► fatos → achados → diagnóstico (com gaps explícitos quando falta dado)
        │
        ▼
 [5] NARRAÇÃO ──────────► resposta em linguagem de gerente, nunca igual à anterior, nunca um relatório
```

Cada etapa é um módulo isolado e testável — o objetivo é poder testar "dado este texto, a etapa 1
retorna esta intenção" sem precisar rodar o pipeline inteiro, e "dados estes fatos, a etapa 4
produz este diagnóstico" sem precisar de um texto de entrada. Isso é uma continuação direta do
padrão que a Sprint 2.0 já usava (funções puras e testáveis) — só reorganizado em torno de
raciocínio em vez de comparação.

## 4. Etapa 1 — Intenção

Hoje, "intenção" é decidida por uma cadeia de `if`s em `service.ts` (`isRecommendationFollowUp`,
`isWhyFollowUp`, `isAreaComparisonFollowUp`, `parseComparisonExpression`, etc.), cada uma checada
na ordem em que foi escrita. O bug corrigido na sprint anterior — uma pergunta de recomendação
sendo capturada pelo parser de datas porque mencionava "semana" — é sintoma direto dessa
estrutura: a intenção nunca foi um conceito de primeira classe, era um efeito colateral de qual
`if` disparava primeiro.

Na 3.0, a intenção vira uma etapa única, executada sempre primeiro, que devolve exatamente uma
categoria:

| Intenção | Exemplo do usuário | Hoje (2.0) |
| --- | --- | --- |
| `diagnose` | "Onde erramos?", "Tem algo preocupante?" | Parcial (`alertas_importantes`) |
| `recommend` | "O que você faria?", "O que devemos fazer?" | Existe (sprint anterior) |
| `evaluate_decision` | "Vale aumentar o preço?", "Vale contratar?", "Devemos vender mais Silver?" | Não existe |
| `explain` | "Por que isso aconteceu?" | Existe |
| `compare` | "Como foi a semana?", "Compare julho com junho" | Existe |
| `inform` | "Quanto faturamos hoje?" | Existe (roteador determinístico) |
| `status_check` | "Como está a empresa hoje?" | Existe (`generateDailySummary`) |
| `clarify_needed` | pergunta ambígua demais para prosseguir com segurança | Não existe — hoje sempre tenta responder algo |

`clarify_needed` é novo e importante: hoje, quando nada bate, o sistema cai no fallback
determinístico e responde *alguma coisa* — às vezes uma resposta genérica que não é o que a
pessoa perguntou. Um gerente de verdade, diante de uma pergunta ambígua, pergunta de volta em vez
de adivinhar. Isso só se aplica quando não há **nenhum** sinal aproveitável (nem palavra-chave, nem
contexto de sessão) — nunca deve ser o caminho mais comum.

A extração de **entidades** (período, filtro de área, métrica, pacote citado — Bronze/Silver/Gold,
etc.) continua sendo feita pelo `date-parser.ts` e por um extrator de entidades equivalente — isso
não muda, só passa a alimentar a etapa de intenção em vez de ser checado em paralelo por `if`s
soltos.

## 5. Etapa 2 — Objetivo oculto

Esta é a etapa genuinamente nova. A intenção diz *o que* a pessoa quer (uma recomendação); o
objetivo diz *para quê*. "Devemos vender mais Silver?" tem intenção `evaluate_decision`, mas o
objetivo real por trás é aumentar faturamento/ticket médio — a resposta não deveria ser só sobre
contagem de pacotes Silver, deveria situar isso dentro do problema de faturamento como um todo.

Proponho uma tabela de inferência determinística (não é IA generativa — é uma tabela de
associação, testável e revisável), chaveada por `(intenção, entidade citada)`, com um objetivo
padrão de "saúde geral do negócio" quando nada específico é citado:

| Intenção + entidade | Objetivo inferido |
| --- | --- |
| `evaluate_decision` + pacote (Bronze/Silver/Gold) | Aumentar ticket médio / melhorar mix de serviço |
| `evaluate_decision` + preço | Avaliar impacto de preço em receita (nunca decide sozinho — é análise, não execução) |
| `evaluate_decision` + "contratar"/equipe | Capacidade operacional (**gap conhecido**: sem dado de equipe/agenda, ver seção 2) |
| `diagnose` sem entidade | Saúde geral do negócio (usa o período/filtro ativo da memória) |
| `recommend` sem entidade nova | **Reaproveita o objetivo da última análise da sessão** — não reinfere do zero |
| `compare` | Objetivo é o próprio ato de comparar — não precisa de objetivo derivado |

A linha mais importante para o bug da sprint anterior é a de `recommend`: "o que você faria?"
depois de "como foi a nossa semana?" não deve rodar a inferência de objetivo de novo — deve puxar
o objetivo (e os achados) que a etapa 4 já produziu na resposta anterior, guardados na memória da
sessão (seção 9). Isso é o que torna a resposta um plano de ação e não uma nova análise do zero.

## 6. Etapa 3 — Busca seletiva de dados

Hoje `buildComparisonReport` sempre calcula as ~12 métricas (JumpPark completo, caixa, DRE),
independente do que foi perguntado — é rápido o suficiente por enquanto, mas é o oposto do "buscar
somente os dados necessários" pedido nesta sprint, e é desperdício real de chamadas (Neon + JumpPark)
sempre que a pergunta só precisa de uma fatia.

Proposta: um **catálogo de ferramentas** (`tools/`) — um registro de todas as funções de busca já
existentes (`fetchOperationalOrders`, `computeOperationalSummary`, `fetchCashLedger`,
`fetchDreReport`, `fetchInventoryOverview`, `computeWashCategoryGroups`, etc.), cada uma com
metadata: o que retorna, de qual fonte, e a que objetivos ela serve. Nenhuma função nova de busca —
é só uma camada de nomeação/registro sobre o que já existe.

E um **planejador** (`planner/`): dado o objetivo (etapa 2) + entidades (etapa 1), devolve a lista
mínima de ferramentas a chamar. Exemplo: objetivo "aumentar ticket médio" → só ticket médio,
faturamento de lavação e contagem de pacotes; **não** busca DRE, não busca caixa, não busca
estacionamento, a menos que a entidade citada seja estacionamento. Isso é uma tabela
`objetivo → ferramentas mínimas`, no mesmo espírito da tabela da etapa 2 — pequena, testável,
sem heurística escondida em código imperativo.

Efeito colateral bom: isso deve reduzir a latência média (parte do problema de lentidão relatado no
início da Sprint 2.0), já que a maioria das perguntas passa a disparar 2–4 chamadas em vez de todas
sempre.

## 7. Etapa 4 — Raciocínio interno

O coração da mudança. Hoje o "raciocínio" é implícito no template de resposta (linhas fixas: "o
que melhorou", "o que merece atenção"). Isso é, na prática, o dashboard disfarçado de frase que o
usuário pediu para parar de existir.

Três camadas, sempre determinísticas (sem IA generativa) e sempre com evidência anexada:

**Fatos** — o que já existe hoje como `ComparisonMetric` (valor atual, valor anterior, direção,
fonte). Não muda a estrutura, só passa a ser chamado explicitamente de "fato", não de "métrica a
exibir".

**Achados** (`Finding`) — um fato (ou combinação de 2–3 fatos) anotado com um significado de
negócio, via uma tabela de regras. Exemplos concretos, com os dados que já temos hoje:

| Combinação de fatos | Achado |
| --- | --- |
| Ticket médio caiu + volume estável ou subiu | "pressão de ticket" |
| Bronze subiu + Silver/Gold caiu (ou não acompanhou) | "piora de mix" |
| Resultado de caixa caiu + faturamento operacional não caiu | "possível lançamento de caixa faltando" |
| Um horário concentra ≥30% dos atendimentos | "pressão de capacidade" |
| Estacionamento cresce mais que lavação (ou vice-versa) | "desequilíbrio entre canais" |

Isso já existia parcialmente como código solto dentro de `buildRecommendations` (sprint anterior)
— a mudança é elevar isso a uma camada própria, nomeada, testável isoladamente, e **reaproveitável
por qualquer intenção** (hoje só recomendação usa essa lógica; diagnóstico e avaliação de decisão
deveriam usar a mesma tabela de achados).

**Diagnóstico** (`Insight`) — os achados relevantes para o **objetivo da etapa 2**, ranqueados,
com os irrelevantes suprimidos. É aqui que "não despejar indicadores sem necessidade" acontece
estruturalmente: um achado só aparece na resposta se for relevante para o que a pessoa realmente
quer saber, não porque o dado existe.

**Gaps** — quando uma regra precisaria de um fato que não existe (métrica indisponível, ou domínio
inteiro não integrado — equipe, agenda, CRM, marketing), o raciocínio emite um gap explícito em vez
de simplesmente não mencionar. Isso é o que garante "se faltar informação, ele deve dizer
exatamente o que falta" — o gap nasce na etapa de raciocínio, não é uma frase de desculpa colada
depois na narração.

## 8. Etapa 5 — Narração

Recebe: intenção, objetivo, insights ranqueados (no máximo 2–3), gaps, memória da sessão (o que já
foi dito). Produz texto em linguagem de gerente — não um template com seções fixas.

Mudanças concretas em relação a 2.0:

- **Fim das seções fixas** ("Números principais:", "O que melhorou:", "O que merece atenção:").
  Isso é formato de relatório — vira prosa corrida, como o exemplo do pedido: "Se eu estivesse
  gerenciando a operação amanhã, faria três mudanças." em vez de "Comparando [período] com
  [período]...".
- **Variação de linguagem** — uma pequena biblioteca de aberturas/fechamentos por intenção (várias
  formas de começar uma recomendação, várias formas de fechar um diagnóstico), com rotação
  controlada pela memória da sessão (não repete uma abertura já usada na mesma conversa). Os
  números e fatos citados nunca variam — só a prosa ao redor deles. Isso preserva "nunca
  inventar dado" enquanto satisfaz "nunca responder igual duas vezes".
- **Fato vs. interpretação vs. recomendação ficam marcados por linguagem natural**, não por
  cabeçalho: "os números mostram que..." (fato), "isso sugere que..." (interpretação), "eu
  focaria em..." / "não mexeria em..." (recomendação) — em vez de rótulos explícitos.
- **Gaps ditos em português direto**: "não tenho dado de equipe para avaliar isso com segurança"
  — nunca omitidos, nunca escondidos atrás de uma resposta genérica.

## 9. Memória conversacional (expandida)

O `ZezinhoContext` de hoje (período ativo, filtro ativo, último tópico) é insuficiente para
"lembrar quais métricas já foram explicadas" e "reaproveitar o objetivo/diagnóstico anterior sem
recomputar" — que são exigências explícitas desta sprint. Proposta de expansão (mantendo a mesma
filosofia: só client-side, nunca persistida no servidor, nunca dado sensível):

- período e filtro ativos — já existe, mantém.
- **objetivo ativo** — o objetivo inferido na última análise, para `recommend` sem entidade nova
  reaproveitar em vez de reinferir.
- **últimos achados/insights** — para uma pergunta de acompanhamento ("e por quê?") explicar em
  cima do que já foi encontrado, sem rebuscar e reprocessar do zero.
- **métricas já explicadas nesta sessão** — para não repetir a mesma frase sobre o mesmo número
  duas vezes se o assunto for revisitado.
- **aberturas de narração já usadas** — para a variação de linguagem (seção 8) não repetir.

Continua sendo estado da sessão do navegador, serializado no corpo da requisição — nenhuma mudança
na garantia de privacidade já estabelecida em 2.0.

## 10. O que NÃO muda (guardrails mantidos)

- **Somente leitura.** Zézinho continua sem poder executar nenhuma ação — só analisar e recomendar.
  Perguntas sobre preço, contratação etc. são sempre análise, nunca execução.
- **Sem IA generativa obrigatória.** Todo o pipeline acima — intenção, objetivo, planner,
  raciocínio, narração — é determinístico (tabelas de regras + funções puras), funciona 100% sem
  nenhum provedor de IA configurado. O `ai-provider.ts` da sprint anterior continua existindo como
  opção futura, não como dependência.
- **Nunca inventar dado.** Todo achado carrega a evidência (fato) que o originou; todo gap é dito
  explicitamente.
- **Reaproveitamento total dos services existentes** (JumpPark, Financeiro, Estoque) — o pipeline
  novo é uma camada de orquestração e raciocínio por cima, não uma reescrita de nenhum desses
  módulos.
- **Fallback determinístico continua existindo** para perguntas simples de fato (`inform`) — não
  faz sentido rodar objetivo + raciocínio para "quanto faturamos hoje?", que já tem resposta direta
  hoje e deve continuar tendo.

## 11. Estrutura de módulos proposta (mapa, sem código)

```
src/lib/zezinho/
  intent/          classificação de intenção (substitui os isXFollowUp soltos em service.ts)
  objective/        tabela intenção+entidade -> objetivo
  tools/             catálogo/registro das buscas já existentes (metadata, não lógica nova)
  planner/           objetivo+entidades -> lista mínima de tools a chamar
  reasoning/         fatos -> achados (tabela de regras) -> insights ranqueados + gaps
  narrator/          (substitui response-builder.ts) prosa + variação de linguagem
  memory/            ReasoningSession (substitui/expande ZezinhoContext)
  date-parser.ts     mantém — alimenta a extração de entidades da etapa 1
  comparison-engine.ts  sobrevive como uma das tools do catálogo (cálculo bruto), deixa de ser
                     chamado por inteiro sempre — só quando o planner pedir
  service.ts         vira o orquestrador do pipeline (5 chamadas em sequência), bem mais fino
                     que hoje
```

Nenhum arquivo dos outros módulos (JumpPark, Financeiro, Estoque) muda.

## 12. Riscos e trade-offs

- **Mais peças móveis.** Cinco etapas testáveis isoladamente é mais estrutura que a cadeia de
  `if`s atual. Mitigação: cada etapa é pequena e pura: dado uma entrada, uma saída — mais fácil de
  testar isoladamente do que a versão atual, mesmo tendo mais arquivos.
- **Tabelas de regras (objetivo, achados) crescem com o tempo.** É um trade-off aceito: preferível
  a heurística espalhada em `if`s, que foi a causa raiz do bug corrigido na sprint anterior.
- **Domínios sem dado real (equipe, agenda, marketing, CRM) vão gerar gaps com frequência** em
  perguntas sobre contratação, agenda ou campanhas. Isso é o comportamento correto (honestidade),
  mas pode fazer o Zézinho "parecer incompleto" em comparação com o discurso de "gerente que sabe
  de tudo" do pedido original — vale alinhar expectativa antes de começar.
- **Variação de linguagem tem limite.** Sem IA generativa, a variedade de frases vem de uma
  biblioteca finita de aberturas/fechamentos. Não é indistinguível de um humano, mas deixa de repetir
  a mesma estrutura de frase a cada resposta.

## 13. Perguntas em aberto (para alinhar antes da Sprint 3.0 começar)

1. Quando `evaluate_decision` toca um domínio sem dado real (equipe, agenda) — o Zézinho deve dar
   uma opinião fraca baseada em proxy (ex.: usar concentração de horário de pico como indício
   indireto de capacidade) claramente rotulada como proxy, ou deve só dizer "não tenho esse dado"
   sem tentar nenhuma aproximação? A seção 8 do pedido diz para nunca inventar — uma proxy
   rotulada como proxy ainda é aceitável, mas quero confirmar o limite antes de implementar.
2. A tabela de objetivo→ferramentas (etapa 3) e a tabela de fatos→achados (etapa 4) devem viver
   como dado versionado no código (fácil de revisar em PR) ou você prefere alguma forma de
   configuração externa? Recomendo código (mesmo padrão do projeto inteiro), só confirmando.
3. Vale integrar `fetchCrmCustomers` (já existe, real, mas não usado por ninguém) nesta sprint como
   uma fonte a mais do catálogo de ferramentas — dado que ele já existe e é real, mesmo a página
   `/clientes` ainda não estando pronta? Isso destravaria perguntas de retenção/clientes
   recorrentes que hoje são gap.
4. Checkpoints: proponho o mesmo formato Z1–Z4 da sprint anterior (cada um com commit+push), mas
   quero definir o corte com você antes — por exemplo: Z1 = intenção+objetivo+memória (sem
   mudar resposta ainda), Z2 = planner+tools, Z3 = raciocínio (fatos→achados→insights), Z4 =
   narrador novo + integração completa + testes da conversa de exemplo do pedido ("como foi a
   semana" → "o que você faria").

Nenhuma implementação foi iniciada. Este documento está em
[docs/zezinho-3.0-architecture.md](docs/zezinho-3.0-architecture.md) para revisão.
