# Handoff para a próxima sessão — Santa Monica OS

Escrito em 10/07/2026, ao final da execução de fundação técnica (banco de dados, segurança,
documentação), motivada por estarmos perto do limite semanal de uso e sem novas execuções
grandes previstas nos próximos 6 dias. Este documento deve permitir que uma nova sessão do
Claude continue sem reler todo o histórico da conversa.

## Estado exato do projeto

- Repositório: `santa-monica-os` (GitHub: `Roberio1210/santa-monica-os`), branch `main`.
- Publicado na Vercel com deploy automático a cada push em `main`.
- **Último commit desta execução: `bed78dd`** — "Adiciona auditoria do estado atual, guia de
  implantação e roadmap por fases" (mais um commit final com este próprio arquivo, ver git log
  para o hash exato após o push).
- Build, lint e typecheck passam limpos nesta versão, **sem `DATABASE_URL` configurada** — essa
  é uma exigência explícita que foi validada nesta execução (`npm run build` rodado sem a
  variável, com sucesso).

## O que funciona (real, em produção)

- Integração JumpPark (somente leitura) — `src/lib/integrations/jumppark/`.
- `/dashboard` — receita hoje/mês reais (corrigidas desde `079d7dc`); demais cards demonstrativos.
- `/operacoes` — "Movimentações de Hoje", 100% real, ordens finalizadas do dia.
- `/estoque` — 48 itens da contagem física de 10/07/2026, reais, mas **não persistentes** (ver
  próxima seção).
- `/configuracoes/status` (novo) — painel administrativo sem dados sensíveis.
- `/api/health` — sempre público, mesmo com o gate de acesso ativado.

## O que é temporário / não persiste

- **Estoque roda em memória** (`StaticInventoryRepository`) porque não há `DATABASE_URL`
  configurada. Qualquer movimentação manual (hoje desabilitada na UI) seria perdida a cada cold
  start em produção. Isso é intencional e documentado, não um bug.
- **Autenticação é só o gate temporário**, desativado por padrão
  (`APP_ACCESS_ENABLED`/`APP_ACCESS_USERNAME`/`APP_ACCESS_PASSWORD`, via `middleware.ts`). A
  autenticação completa com papéis (`owner`/`manager`/`parking`/`detailing`/`finance`/`hr`/
  `read_only`) está **modelada mas não implementada** (`src/lib/auth/`).
- **Módulos Lavação, Estacionamento, Agenda, Clientes, Financeiro, Marketing, Compras,
  Segurança, Zézinho** continuam 100% demonstrativos (`src/data/mock/*`), como antes desta
  execução — nada mudou neles.
- **Contratos (IESA, Funerária, Don Juan)** têm modelo de dados e seed prontos
  (`src/db/seed/contracts.ts`), mas **não há tela** ainda para visualizá-los — só existem como
  dados prontos para quando o banco for ativado.

## Decisões tomadas nesta execução

1. **ORM: Drizzle**, não Prisma — justificativa completa em `docs/database-architecture.md`
   (resumo: sem codegen obrigatório, mais leve em serverless, compila sem banco).
2. **Driver: `postgres` (postgres.js)**, compatível com Neon e Vercel Postgres.
3. **20 tabelas modeladas**, nenhuma aplicada a um banco real ainda (nenhum banco foi criado
   nesta execução — decisão do proprietário, ver `docs/database-and-auth-setup-guide.md`).
4. **Seeds idempotentes** via colunas `external_id` únicas + `ON CONFLICT DO NOTHING` — rodar os
   scripts de seed mais de uma vez nunca duplica dados.
5. **Nenhum dado inventado**: estoque mínimo, custos unitários, forma de pagamento da IESA (não
   informada — armazenada como `"desconhecido"`), datas de início de contrato (não informadas —
   `null`) — tudo documentado explicitamente onde ficou faltando.
6. **Gate de acesso temporário via Basic Auth** (não um sistema de login completo) como proteção
   imediata, porque a autenticação completa depende de banco + implementação adicional
   (hash de senha, sessão) que não foi escrita nesta execução.
7. **RH modelado em duas tabelas separadas** (`employees` CLT, `contractors` PJ) — nunca
   misturadas, ver `docs/hr-module-architecture.md`.
8. **Nenhuma cobrança automática, nenhum cron de sincronização, nenhuma integração de escrita**
   foi implementada — tudo isso ficou apenas como arquitetura documentada, aguardando
   autorização explícita do proprietário.

## Próximos 10 passos (em ordem sugerida)

1. Proprietário decide se/quando criar o banco (Vercel Postgres ou Neon) — ver
   `docs/database-and-auth-setup-guide.md`.
2. Rodar `npm run db:migrate` e os dois seeds (`db:seed:inventory`, `db:seed:contracts`).
3. Ativar o gate temporário (`APP_ACCESS_ENABLED=true` na Vercel) como proteção imediata,
   independente do banco.
4. Trocar `StaticInventoryRepository` por `PostgresInventoryRepository` em produção (automático
   assim que `DATABASE_URL` existir — nenhuma mudança de código necessária, ver
   `src/lib/inventory/repository-factory.ts`).
5. Habilitar a UI de movimentações manuais de estoque (hoje desabilitada de propósito) — só
   depois do passo 4 e de autenticação real.
6. Implementar autenticação completa (sessão + papéis) — a peça que falta é a lógica de
   verificação de senha e cookie de sessão; o modelo (`users`, `src/lib/auth/roles.ts`) já existe.
7. Construir a tela de contratos (`/contratos` ou `/financeiro/contratos`) usando os dados já
   semeados.
8. Migrar `/financeiro` para dados reais (Fase 4 do roadmap).
9. Quando os 3 contratos PJ forem assinados, avaliar cadastro real de RH (Fase 6).
10. Reavaliar prioridade da sincronização automática JumpPark → banco
    (`docs/jumppark-sync-strategy.md`) vs. outras fases, com o proprietário.

## Comandos para retomar

```bash
cd /Users/roberiofilho/projetos/santa-monica-os
npm install
npm run lint && npx tsc --noEmit && npm run build   # confirma que tudo continua verde
git log --oneline -10                                # confirma o commit mais recente
```

Sem `DATABASE_URL`, os comandos `db:migrate`/`db:seed:*` falham com uma mensagem clara — isso é
esperado, não é um erro a corrigir.

## Riscos conhecidos

- **App publicamente acessível por padrão** até o gate temporário ou a autenticação completa
  serem ativados — o maior risco de segurança atual (ver `docs/current-state-audit.md`, seção 4).
- **Estoque não persiste** em produção — qualquer expectativa de "salvar uma movimentação" antes
  do banco estar configurado vai falhar silenciosamente após um cold start.
- **`/estacionamento` (mock) e `/operacoes` (real) coexistem** sem modelo compartilhado — decisão
  consciente de não unificar ainda, documentada em `docs/current-state-audit.md`, seção 6.2.
- Nenhum teste automatizado existe no projeto — todo o build/lint/typecheck passou nesta execução,
  mas não há cobertura de regressão para mudanças futuras.

## Arquivos mais importantes para retomar contexto

| Arquivo | Por quê |
| --- | --- |
| `docs/current-state-audit.md` | Fotografia completa do projeto antes desta execução. |
| `docs/database-architecture.md` | Todas as decisões de banco (ORM, driver, 20 tabelas). |
| `docs/database-and-auth-setup-guide.md` | Roteiro que o proprietário segue sem o Claude. |
| `docs/roadmap.md` | As 9 fases priorizadas, com dependências e critérios de aceite. |
| `src/db/schema/` | Fonte da verdade do modelo de dados (schema Drizzle). |
| `src/lib/inventory/repository-factory.ts` | Como a escolha Postgres/memória acontece automaticamente. |
| `middleware.ts` | O gate de acesso temporário. |
| `docs/hr-module-architecture.md` | Por que CLT e PJ são modelados separadamente. |
| `docs/jumppark-sync-strategy.md` | Como a sincronização deve ser implementada quando autorizada. |

## Pendências que exigem decisão do proprietário (não técnicas)

1. Qual banco criar (Vercel Postgres vs. Neon) e quando.
2. Quando ativar o gate temporário (`APP_ACCESS_*`) — recomendado o quanto antes, é de baixo
   esforço.
3. Confirmação dos 3 contratos PJ assinados, para então autorizar cadastro real de RH.
4. Prioridade entre as Fases 3–9 do roadmap — a ordem sugerida é uma recomendação, não uma
   obrigação.
5. Qual integração da Fase 9 (Stone, WhatsApp, câmeras, marketing) vale mais a pena ativar
   primeiro, quando chegar a hora.
