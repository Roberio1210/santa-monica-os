# Roadmap Executivo — Santa Monica OS

Documento oficial de evolução, definido em 04/08/2026 sob o mandato de CTO registrado em
[docs/product-vision.md](./product-vision.md). Substitui `docs/roadmap.md` (10/07/2026, já
desatualizado — descrevia fases hoje concluídas) e `docs/product-backlog.md` (visão pré-Missão 21)
como referência de prioridade. Baseado no estado real do sistema, apurado em
[docs/system-audit-2026-08-04.md](./system-audit-2026-08-04.md) e no trabalho já entregue na
Missão 25 (unificação de CRM, correção de compras sugeridas, clientes sem retorno, fidelização).

**Nenhum código foi escrito para produzir este documento** — é só plano, como pedido.

---

## 1. Onde estamos, em uma frase

O Santa Monica OS tem arquitetura e engenharia sólidas nos módulos centrais (Atendimento,
Estoque, Financeiro, CRM), mas roda hoje como um **conjunto de telas que mostram números**, não
como o "cérebro" que a visão pede — porque falta a camada de dado persistido e histórico que
sustenta inteligência, investigação e rastreabilidade de verdade. A causa raiz é única: **quase
nada é gravado permanentemente a partir da JumpPark.**

## 2. O bloqueio crítico — precisa ser resolvido antes de qualquer fase abaixo

A JumpPark é hoje a única fonte de dado operacional real e volumoso do negócio (movimentação de
estacionamento e lavação). Hoje:

- As telas que a usam (`/movimentacoes`, `/lavacao`, `/estacionamento`, alertas da Central de
  Operações, consumo de estoque por ordem) **leem a API ao vivo a cada carregamento** — nada é
  persistido no Neon.
- Não existe pipeline de sincronização (`jumppark_service_orders`/`jumppark_sync_logs` existem no
  schema, 0 linhas, nenhum código as usa).
- A integração está com HTTP 401 em produção agora, por variáveis incorretas na Vercel — correção
  pendente de confirmação do proprietário (ver troca de mensagens anterior a este documento).

**Toda a Fase 2 em diante deste roadmap depende de dado histórico persistido.** Sem isso, "abrir
qualquer dia do calendário", "consumo médio diário real", "cliente que sempre compra Gold",
"drill-down até o registro original" são apenas telas bonitas sobre um `fetch` ao vivo — não têm
como responder "o que aconteceu" para uma data passada, porque nada do passado fica guardado.

**Conclusão de CTO:** a Fase 1 (sincronização JumpPark → Neon) não é uma tarefa de infraestrutura
qualquer — é o investimento de maior alavancagem de todo o roadmap, porque destrava sozinha metade
dos itens da visão. Sem ela, qualquer outra fase é enfeite.

## 3. Onde a visão pede mais do que o sistema entrega hoje — por camada

| Camada | Pedido na visão | Estado real hoje |
|---|---|---|
| Dados históricos | "abrir qualquer dia do calendário" | Não existe persistência de ordens JumpPark; só leitura ao vivo do dia atual/período recente |
| Inteligência | "18 possuem ticket acima de R$250, 9 costumam fazer Gold..." | CRM (Missão 25) já segmenta por status/VIP/recorrência, mas com **zero clientes reais hoje** (fonte é o Atendimento, que não tem uso real ainda — ver seção 6) |
| Investigação (drill-down) | "todo card, todo KPI, clicável, até o registro original" | Só implementado em `/estoque/compras-sugeridas` (coluna "como foi calculado") e nas duas telas novas do CRM. Dashboard, Painel Gerencial, Financeiro: ainda cards estáticos |
| Rastreabilidade | "por que esse número existe, como foi calculado" | Padrão validado em 1 tela; não generalizado |
| Estoque investigável | "consumo médio diário, dias restantes, melhor fornecedor" | Autonomia por receita existe; consumo médio diário unificado e "melhor fornecedor por preço" não existem |
| CRM que descobre sozinho | "cliente que nunca fez vitrificação, que sempre compra Gold, que gera mais lucro" | Segmentação atual é por frequência/dias sem retorno; cruzamento por tipo de serviço/lucratividade não existe |
| Alertas explicáveis | "o que aconteceu, por quê, como resolver, impacto financeiro" | Alertas atuais (`central.ts`) têm título + link, sem os 4 campos completos nem impacto financeiro calculado |
| Automação | — | Menor prioridade da própria visão; hoje quase inexistente (recorrências financeiras é o único exemplo real) |

## 4. Fases — ordem de maior alavancagem primeiro

Estimativa em "missões" (unidade de trabalho já usada neste projeto — cada uma é um ciclo
completo de schema/domínio/UI/testes/deploy). Todas as fases abaixo pressupõem a JumpPark já
restaurada (bloqueio da seção 2).

### Fase 1 — Sincronização JumpPark → Neon (fundação de dados)
**Objetivo:** parar de perder o passado. Toda ordem finalizada da JumpPark (estacionamento e
lavação) passa a ser gravada no Neon, de forma idempotente, ativando a arquitetura já desenhada em
`docs/jumppark-sync-strategy.md` (nunca ativada até hoje).
**Entrega:** job de sincronização (cron ou botão manual em `/admin/diagnostico`), preenchendo
`jumppark_service_orders`/`jumppark_sync_logs`; backfill do histórico disponível na API.
**Por que é #1:** sem isso, nenhuma fase de "investigação"/"histórico"/"inteligência" tem dado real
para trabalhar — seria construir UI sobre nada.
**Dependência:** JumpPark restaurada em produção (bloqueio atual).
**Esforço estimado:** 1 missão.
**Benefício:** desbloqueia as Fases 2–6 inteiras. Sem essa fase, o resto deste documento não pode
começar.

### Fase 2 — Decisão de arquitetura do CRM + população imediata de histórico de cliente
**Objetivo:** resolver uma tensão real que a Fase 1 expõe. Hoje o CRM Inteligente (Missão 25) lê
só do módulo Atendimento — que tem zero uso real em produção, então `/crm/sem-retorno` e
`/crm/fidelizacao` estão vazios não por bug, mas porque a equipe ainda não usa o Atendimento no
dia a dia. **Proposta de CTO:** uma vez que a Fase 1 exista, o histórico de ordens da JumpPark
(estacionamento + lavação, com nome/telefone do cliente) passa a ser uma segunda fonte real e já
populada de identidade de cliente — e pode alimentar o CRM imediatamente, sem esperar adoção do
Atendimento. Isso é exatamente o mesmo problema que a Missão 25 resolveu ao unificar os dois CRMs
(um baseado em JumpPark ao vivo, outro no Atendimento) — a diferença é que agora a fonte JumpPark
estaria **persistida e correta**, não mais um "segundo histórico divergente" a ser descartado.
**Entrega:** identidade de cliente (telefone como chave) casada entre ordens JumpPark sincronizadas
e cadastro do Atendimento, sem duplicar registro quando os dois existirem.
**Esforço estimado:** 1 missão.
**Benefício:** "Clientes sem retorno" e "Fidelização" passam a ter dado real no primeiro dia após o
deploy, em vez de esperar meses de adoção do Atendimento.

### Fase 3 — Histórico Operacional (qualquer dia do calendário)
**Objetivo:** a visão de dia único pedida na Missão 25 (seção 1) e reforçada agora — abrir
23/05/2026 e ver carros atendidos/estacionados, horários, serviços, faturamento, ticket médio,
clientes, funcionários, consumo de produtos.
**Dependência:** Fase 1 (sem dado persistido, só dá para ver "hoje", nunca uma data passada).
**Esforço estimado:** 1–2 missões (visão + filtros + timeline cronológica).
**Nota de CTO — item a questionar:** "fotos do dia" e "lucro estimado por dia" da sua lista de
exemplos são as duas peças com menor retorno imediato: fotos (`diagnosticPhotos.url` hoje é sempre
`null`, upload real não existe — construir isso é trabalho de outra frente, câmera/storage, não
histórico) e "lucro" exige custo de mão de obra e overhead que o sistema não modela hoje (só tem
receita e custo de produto). Recomendo entregar o histórico sem essas duas peças na primeira
versão, e tratá-las como fases separadas se o retorno justificar.

### Fase 4 — Drill-down universal + "como foi calculado" generalizado
**Objetivo:** o padrão que já existe em 1 lugar (`/estoque/compras-sugeridas`) vira um componente
reutilizável, aplicado a Dashboard, Painel Gerencial e Financeiro — todo card leva a uma tela de
detalhe, todo indicador tem "como foi calculado".
**Dependência:** Fases 1 e 3 (drill-down de faturamento/OS só existe se a OS/ordem estiver
persistida).
**Esforço estimado:** 2 missões (1 para o componente reutilizável + padrão, 1 para aplicar nos
módulos que faltam).
**Benefício:** elimina a "caixa preta" pedida na visão, de uma vez, em vez de tela por tela.

### Fase 5 — Estoque investigável completo
**Objetivo:** consumo médio diário real (não só por receita aprovada), dias restantes até acabar,
comparação consumo previsto × real, melhor fornecedor por preço histórico.
**Dependência:** parcialmente já possível hoje (o cálculo de sugestão de compra da Missão 25 já usa
consumo real do livro-razão) — mas "melhor fornecedor" precisa de histórico de preço por
fornecedor, hoje só guardado no último valor pago, não numa série histórica comparável.
**Esforço estimado:** 1–2 missões.

### Fase 6 — CRM avançado: oportunidades que o sistema descobre sozinho
**Objetivo:** os exemplos mais ambiciosos da visão — cliente que nunca fez vitrificação, que
sempre compra Gold, que gera mais lucro, aumento/queda de frequência, potencial de indicação.
**Dependência:** Fases 1 e 2 (precisa de histórico de serviço por cliente, com valor e categoria,
em volume real).
**Nota de CTO — item a questionar:** "cliente que pode indicar novos clientes" não tem hoje
nenhuma fonte de dado no projeto (não existe campo de indicação/referência em nenhum cadastro).
Implementar isso exigiria perguntar ao cliente "quem te indicou" no atendimento — é uma decisão de
processo operacional, não só de software. Eu questionaria essa entrega até haver esse dado
capturável de verdade; caso contrário seria um número inventado.
**Esforço estimado:** 2 missões.

### Fase 7 — Alertas explicáveis com impacto financeiro
**Objetivo:** cada alerta de `central.ts` passa a responder as 4 perguntas da visão (o que
aconteceu, por que, como resolver, quanto impacta financeiramente).
**Dependência:** Fase 4 (reaproveita o mesmo padrão de explicação).
**Esforço estimado:** 1 missão.

### Fase 8 — Automação
**Objetivo:** menor prioridade, por definição sua. Candidatos reais (não genéricos de ERP):
geração automática de mensagem de recuperação quando um cliente cruza 45 dias sem retorno (hoje é
manual, sob demanda); disparo automático de sugestão de compra quando o estoque cruza o mínimo.
**Esforço estimado:** 1 missão, só depois de tudo acima existir.

### Fase 9 — Polimento visual
**Objetivo:** última prioridade, por definição sua. Só depois que inteligência, investigação,
rastreabilidade e automação estiverem entregues.

## 5. O que eu questionaria antes de construir (aplicando o mandato)

- **"Fotos do dia" no histórico operacional** — sem upload real de imagem implementado em lugar
  nenhum do sistema hoje, essa peça específica não passa no filtro "isso será realmente utilizado
  no dia a dia" até existir a funcionalidade de câmera, que é um projeto à parte.
- **"Lucro estimado" por dia/cliente** — o sistema não modela custo de mão de obra nem overhead;
  "lucro" hoje só pode ser honestamente "receita − custo de produto consumido", o que é uma métrica
  parcial. Eu proporia chamar isso de "resultado direto" em vez de "lucro" até haver dado de custo
  operacional completo — mesmo cuidado que já foi tomado no Painel Gerencial (Missão 17), que
  evita chamar seu indicador de "lucro" pelo mesmo motivo.
- **"Quem pode indicar novos clientes"** — sem fonte de dado, é ou um campo novo a capturar no
  atendimento (mudança de processo, não só de software) ou fica descartado até existir.

## 6. Métrica de sucesso por fase

Cada fase só é considerada concluída quando passa nas 6 perguntas do mandato — não quando o código
compila. Critério prático: depois de cada fase, Robério ou Vinícius conseguem, sem perguntar a
ninguém, responder uma pergunta operacional real que não conseguiam responder antes.

## 7. Próximo passo

Nada começa antes da JumpPark estar restaurada e confirmada (bloqueio da seção 2). Assim que
confirmar, a Fase 1 (sincronização JumpPark → Neon) é o próximo trabalho de código deste projeto —
nesta ordem, salvo instrução sua em contrário.
