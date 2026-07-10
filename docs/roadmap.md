# Roadmap — Santa Monica OS

Atualizado em 10/07/2026, na execução de fundação técnica (banco de dados, segurança,
documentação). Substitui o modelo anterior de "Sprints" por fases priorizadas — reflete melhor o
estado real do projeto (integração JumpPark e módulos de Operações/Estoque já em produção).

## Concluído até 10/07/2026

- Projeto Next.js + TypeScript + Tailwind, publicado na Vercel, deploy automático via GitHub.
- Integração JumpPark real em produção (`/dashboard` parcial, `/operacoes` completo).
- Módulo de Estoque com os 48 itens da contagem física de 10/07/2026 (`/estoque`).
- Fundação técnica desta execução: arquitetura de banco (Drizzle + Postgres, 20 tabelas),
  camada de repositório com escolha automática Postgres/memória, seed idempotente de estoque e
  contratos, gate de acesso temporário, headers de segurança, error boundary,
  `docs/current-state-audit.md`, `docs/database-architecture.md`,
  `docs/hr-module-architecture.md`, `docs/privacy-and-access-control.md`,
  `docs/jumppark-sync-strategy.md`, `docs/database-and-auth-setup-guide.md`.

## Fase 1 — Segurança e banco

**Objetivo:** sair do estado "publicamente acessível, sem banco" para "protegido, com banco real".

- Entregas: banco Postgres provisionado (Vercel Postgres ou Neon); migrations aplicadas;
  autenticação completa com papéis (owner/manager/parking/detailing/finance/hr/read_only)
  substituindo o gate temporário de Basic Auth.
- Dependências: decisão do proprietário sobre qual provedor de banco usar (`docs/database-and-auth-setup-guide.md`).
- Riscos: enquanto a autenticação completa não estiver pronta, o gate temporário
  (`APP_ACCESS_*`) é a única proteção — usuário/senha únicos, sem papéis, sem expiração de
  sessão granular.
- Critério de aceite: nenhuma página ou rota privada acessível sem login; `/api/health`
  continua público; primeiro usuário `owner` consegue logar e ver todos os módulos.

## Fase 2 — Estoque persistente

**Objetivo:** o módulo de Estoque passa a gravar movimentações de verdade, sem perder dados em
cada cold start.

- Entregas: `PostgresInventoryRepository` (já escrito nesta execução) ativado em produção; UI de
  movimentações manuais habilitada (hoje desabilitada por falta de banco/autenticação).
- Dependências: Fase 1 (banco + autenticação, já que a UI de movimentação só deve ser habilitada
  com login).
- Riscos: primeira gravação real precisa ser testada com cuidado — conferir que
  `ajuste_inventario` (valor absoluto) não é confundido com os demais tipos (delta).
- Critério de aceite: registrar uma movimentação manual reflete a nova quantidade após reload da
  página, e continua correta após um novo deploy (prova de persistência real).

## Fase 3 — Contratos e contas a receber

**Objetivo:** transformar as regras hoje documentadas/semeadas (IESA, Funerária, Don Juan) em uma
tela real de acompanhamento financeiro B2B.

- Entregas: tela `/contratos` ou `/financeiro/contratos` mostrando parceiros, contratos,
  benefícios e status de recebíveis; aplicação dos seeds (`npm run db:seed:contracts`) em
  produção.
- Dependências: Fase 1.
- Riscos: nenhuma cobrança automática deve ser implementada nesta fase (mantém-se manual,
  conforme decisão desta execução) — risco de o proprietário esperar automação que não existe
  ainda; comunicar isso claramente na UI.
- Critério de aceite: os 3 contratos reais aparecem corretamente na tela, com o único
  recebimento confirmado (IESA, R$ 900,00) refletido como "pago".

## Fase 4 — Financeiro e conciliação

**Objetivo:** `/financeiro` deixa de ser 100% demonstrativo.

- Entregas: `/financeiro` passa a usar a receita corrigida do JumpPark (`totalRevenue`, já
  corrigida em produção desde `079d7dc`) em vez de `mock/finance.ts`; início de conciliação
  entre `payments` e extratos reais (Stone ou manual).
- Dependências: Fases 1–3.
- Riscos: divergência entre o que o JumpPark reporta como "dinheiro" e o que efetivamente entra
  no caixa (documentado desde `docs/jumppark-open-orders-investigation.md` e reforçado no seed de
  contratos — "registros lançados como dinheiro não significam necessariamente caixa recebido").
- Critério de aceite: card "Receita hoje/mês" usa a mesma fonte em `/dashboard` e `/financeiro`,
  sem duplicidade de lógica.

## Fase 5 — CRM

**Objetivo:** `/clientes` deixa de ser 100% demonstrativo.

- Entregas: `customers`/`vehicles` (já modelados) alimentados por dados reais — inicialmente
  captura manual, depois cruzamento com `jumppark_service_orders` por placa.
- Dependências: Fases 1–2, Fase 9 (sincronização JumpPark) parcialmente.
- Riscos: dado de cliente é PII — exige que a Fase 1 (autenticação) esteja sólida antes de
  popular nomes/telefones completos em produção.
- Critério de aceite: um cliente real cadastrado aparece com histórico de visitas vindo de ordens
  sincronizadas, sem dado inventado.

## Fase 6 — RH

**Objetivo:** transformar `docs/hr-module-architecture.md` em tela real.

- Entregas: cadastro de `employees` (1 CLT) e `contractors` (3 PJs, quando os contratos forem
  assinados); `employee_documents` com upload de arquivo (requer decisão de provedor de storage).
- Dependências: Fase 1 (dado sensível — salário, CPF/CNPJ); contratos PJ assinados
  (pendência do proprietário, fora do controle técnico).
- Riscos: dado trabalhista tem implicação legal — qualquer cálculo automatizado (férias, 13º)
  deve ser revisado por contador antes de confiar no sistema.
- Critério de aceite: o funcionário CLT e os 3 PJs aparecem cadastrados corretamente, com
  documentos anexados, visível apenas ao papel `hr`/`owner`.

## Fase 7 — Estoque com baixa automática

**Objetivo:** consumo de produto é debitado automaticamente ao concluir um serviço.

- Entregas: `service_consumption_rules` (já modelada) populada com fichas técnicas reais (ex.:
  "lavagem completa consome 50 ml de V-Floc Shampoo"); geração automática de
  `inventory_movements` do tipo `consumo_interno` ao sincronizar uma ordem finalizada do
  JumpPark.
- Dependências: Fase 2 (estoque persistente), Fase 9 (sincronização JumpPark).
- Riscos: ficha técnica errada gera baixa de estoque incorreta silenciosamente — validar com
  poucos serviços antes de generalizar.
- Critério de aceite: registrar/sincronizar um serviço com ficha técnica cadastrada gera a
  movimentação de consumo correta automaticamente, sem intervenção manual.

## Fase 8 — Agentes de IA

**Objetivo:** Zézinho e especialistas (Carlos, Bia, Vini, Nina, Eva, Beto, Marta, Radar, Memória
— ver `docs/agents.md`) conectados a um modelo real, com dados reais das fases anteriores.
- Entregas: Zézinho respondendo com dados reais (não mock); alertas automáticos baseados em
  `alerts` (já modelada); recomendações reais com aprovação humana obrigatória (princípio já
  documentado em `docs/architecture.md`).
- Dependências: Fases 1–7 (agentes são tão bons quanto os dados que têm disponíveis).
- Riscos: nenhuma ação financeira/comercial/destrutiva automática — reforçar esse princípio no
  prompt/arquitetura do agente.
- Critério de aceite: uma pergunta real ao Zézinho sobre estoque/financeiro retorna dado real do
  banco, com fonte e data indicadas, nunca um número inventado.

## Fase 9 — Integrações Stone, banco, WhatsApp, câmeras e marketing

**Objetivo:** ativar as integrações hoje só documentadas como metadados
(`src/lib/integrations/{stone,whatsapp,meta,google,mercadolivre,cameras}`).
- Entregas: uma integração por vez, começando pela de maior valor imediato (provavelmente Stone,
  para conciliação financeira — depende de decisão do proprietário); sincronização JumpPark
  automatizada (`docs/jumppark-sync-strategy.md`) também entra aqui, se ainda não priorizada
  antes.
- Dependências: Fase 1 (nenhuma integração de escrita deve rodar num app sem autenticação);
  credenciais de cada serviço (a serem fornecidas pelo proprietário quando decidir avançar).
- Riscos: cada integração nova é uma superfície de risco de segurança e custo — ativar uma de
  cada vez, com o modelo de permissões/riscos já documentado em `src/lib/integrations/types.ts`.
- Critério de aceite (por integração): dados reais aparecem na tela correspondente, com
  indicação clara de fonte, sem nenhuma ação de escrita automática sem aprovação humana.
