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
   (`admin.jumppark.com.br` → Configurações → API Aberta / documentação) se existe um
   endpoint dedicado a ocupação/pátio atual — o acesso à documentação completa exige
   login, que este projeto não possui.
2. Alternativamente, contatar o suporte da JumpPark diretamente perguntando se há
   endpoint para "veículos atualmente no pátio" ou "ordens sem saída".
3. Se nenhum endpoint existir, considerar registrar entrada/saída localmente (ex.: via
   webhook, se a JumpPark oferecer, ou consulta periódica comparando entradas vs.
   saídas) — fora do escopo desta tarefa.
4. Enquanto isso não for resolvido, manter "Informação indisponível" em qualquer card
   que dependeria desse dado, em vez de estimar ou inferir um número.
