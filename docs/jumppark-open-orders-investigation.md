# Investigação — endpoint de veículos no pátio / ordens abertas (JumpPark)

Investigação feita em 2026-07-10, motivada pelo achado em `docs/jumppark-data-map.md`
de que `/serviceorders/export/json` retornou `stillOpen: 0` em 1.708 ordens amostradas
entre 2026-01-01 e 2026-07-10 — nenhuma ordem sem `exitDateTime` apareceu na amostra,
apesar do volume e do período (~6 meses).

## O que foi verificado

1. **Documentação oficial** (`https://docs.jumpparkapi.com.br/public/` e
   `https://docs.jumpparkapi.com.br/public/docs/api-reference`, citada no cabeçalho de
   `referencias/jumppark_api.py`): ambas as URLs retornaram **HTTP 403** ao acesso
   automatizado (bloqueio de bot ou exigência de login no portal). Não foi possível ler
   a lista completa de endpoints por essa via.
2. **Busca na web** por endpoints JumpPark relacionados a veículos no pátio, ordens
   abertas ou estacionamento em tempo real: nenhum resultado relevante encontrado — a
   documentação pública da JumpPark não está indexada/acessível para essa consulta.
3. **Código-fonte já existente no projeto** (`referencias/jumppark_api.py`, script de
   referência validado anteriormente, e `src/lib/integrations/jumppark/`): referenciam
   **apenas dois endpoints**:
   - `GET /reports/financial?startDate&endDate`
   - `GET /serviceorders/export/json?startDate&endDate`
   
   Nenhum outro endpoint (ex.: `/parking/current`, `/serviceorders/open`, algo do tipo
   "status em tempo real") aparece em nenhum lugar do código ou dos scripts herdados.
4. **Evidência empírica** (`docs/jumppark-data-map.md`, seção "Limitações", item 2):
   1.708 ordens consultadas, 100% delas com `exitDateTime` preenchido. Isso é um sinal
   forte — embora não uma prova definitiva — de que `/serviceorders/export/json` pode
   não incluir ordens ainda em aberto (veículo ainda no pátio), e não apenas que o
   estacionamento nunca teve carro parado durante os testes.

## Conclusão

**Não existe, dentro do que está documentado e acessível para este projeto, um
endpoint confirmado como confiável para "veículos atualmente no pátio" ou "ordens
abertas".** Nenhuma solução foi inventada para substituir essa lacuna.

Isso significa:

- O card **"No estacionamento"** no dashboard não deve (e não vai) exibir um número
  calculado a partir de `/serviceorders/export/json` — passou a mostrar
  "Informação indisponível" quando os dados são reais (`liveData`), com o hint
  "sem endpoint confiável".
- A função `fetchOverviewMetrics` (`src/lib/integrations/jumppark/service.ts`) não
  calcula mais `vehiclesPresent` — o campo foi removido da interface
  `JumpParkOverviewMetrics`, já que a lógica anterior (filtrar `!exitDateTime`) não é
  confiável.
- A tela "Movimentações de Hoje" (`/operacoes`) mostra apenas **ordens finalizadas**
  (com `exitDateTime`), pois é o único dado confirmado como confiável nesse endpoint.

## Próximos passos recomendados (não executados nesta tarefa)

1. Confirmar manualmente no painel autenticado da JumpPark
   (`admin.jumppark.com.br` → Configurações > API Aberta / documentação) se existe um
   endpoint dedicado a ocupação/pátio atual — o acesso à documentação completa exige
   login, que este projeto não possui.
2. Alternativamente, contatar o suporte da JumpPark diretamente perguntando se há
   endpoint para "veículos atualmente no pátio" ou "ordens sem saída".
3. Se nenhum endpoint existir, considerar registrar entrada/saída localmente (ex.: via
   webhook, se a JumpPark oferecer, ou consulta periódica comparando entradas vs.
   saídas) — fora do escopo desta tarefa.
4. Enquanto isso não for resolvido, manter "Informação indisponível" em qualquer card
   que dependeria desse dado, em vez de estimar ou inferir um número.

## Reinvestigação — 20/07/2026 (Sprint "Gerente Operacional 4.0")

Reaberta a pedido explícito ("não aceite rapidamente que determinado dado não existe").
Nada do que segue muda a conclusão original — reforça com uma segunda amostra maior e mais
recente, e esgota as vias de acesso público disponíveis sem login.

1. **`docs.jumpparkapi.com.br/public/` e `.../docs/api-reference`** — testados de novo via
   fetch fresco: continuam retornando **HTTP 403** (bloqueio de bot/exige login), igual à
   tentativa de 10/07.
2. **Busca na web** por endpoints JumpPark além dos dois já conhecidos (parking/current,
   ordens abertas, ocupação em tempo real): nenhum resultado — o domínio não tem documentação
   pública indexada em buscador nenhum.
3. **Segunda amostra, independente e mais recente**: `referencias/jp_orders.json` (fora do
   repositório, arquivo local de referência do cliente) — **1.732 registros** (1.265 de
   estacionamento + 467 de lavação) cobrindo **115 dias distintos, 05/03 a 13/07/2026**
   (mais recente que a amostra original de 10/07). **0 de 1.732 registros** têm horário de
   saída ausente. Esse arquivo usa um formato próprio (chaves curtas `en`/`ex`/`ti`/`te`),
   então não é prova de que a API bruta nunca retorna ordem aberta — mas é mais uma amostra
   grande e recente 100% consistente com a mesma hipótese.
4. **`referencias/jumppark_api.py`** (script de referência do cliente, fora do repositório):
   confirma só os mesmos dois endpoints já documentados
   (`/reports/financial`, presumivelmente o mesmo `/serviceorders/export/json` usado pelo
   projeto) — nenhum endpoint novo. **Nota de segurança**: esse script tem um token Bearer em
   texto puro. Não usei essa credencial para nenhuma chamada nesta investigação (evitar
   manusear segredo em texto puro fora do fluxo já estabelecido de variável de ambiente do
   projeto) — recomendo rotacionar esse token no painel da JumpPark e nunca deixá-lo em texto
   puro num arquivo local, mesmo fora do repositório.

### Conclusão (mantida)

Sem acesso à documentação completa (exige login) e sem endpoint alternativo conhecido, **a
conclusão de 10/07 permanece**: não existe, dentro do que é acessível para este projeto sem
login no painel JumpPark, uma forma confiável de saber veículos em atendimento agora, ordens
abertas, serviços iniciados ou veículos aguardando entrega. A única via que resolveria isso de
verdade é você (ou quem tiver login no `admin.jumppark.com.br`) confirmar na aba "API Aberta"
do painel se existe endpoint de ocupação em tempo real, ou perguntar ao suporte da JumpPark
diretamente — não há mais nada que eu consiga investigar sem essa credencial de painel.

Como não há solução, a Sprint 4.0 vai usar `historical_pattern` (padrão histórico do mesmo
horário/dia da semana) como o melhor substituto disponível para dar noção de movimento
esperado — sempre rotulado como estimativa histórica, nunca como contagem em tempo real.
