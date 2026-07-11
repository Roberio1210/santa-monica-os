# Guia de implantação — banco de dados e autenticação

Roteiro para o proprietário executar, em linguagem simples, sem precisar do Claude. **Nunca cole
senhas ou tokens reais em conversas com IA, issues do GitHub ou qualquer lugar público.**

**Atualização de 10/07/2026: os passos 1 a 4 já foram concluídos.** O proprietário criou e
conectou um banco Neon Postgres à Vercel, e as migrations + os 3 seeds foram aplicados e
confirmados (ver `docs/next-session-handoff.md` para as contagens exatas). Os passos 1–4 abaixo
ficam documentados para referência futura (ex.: recriar o ambiente, montar um banco de
staging) — o que falta agora são os passos 5–7.

## Visão geral (ordem recomendada)

1. ~~Criar o banco de dados.~~ ✅ Concluído (Neon).
2. ~~Conectar o banco na Vercel.~~ ✅ Concluído.
3. ~~Rodar as migrations (cria as tabelas).~~ ✅ Concluído — 25 tabelas, 2 migrations aplicadas.
4. ~~Aplicar os seeds (estoque + contratos + plano de contas).~~ ✅ Concluído — todos os três.
5. Criar o primeiro usuário `owner` (manual, direto no banco, por enquanto). **Pendente.**
6. Ativar o gate de acesso temporário (proteção rápida, antes da autenticação completa).
   **Pendente — recomendado com prioridade alta agora que há dado real persistente.**
7. Validar tudo. Parcialmente feito (banco/seeds validados nesta execução) — falta validar 5–6.

## 1. Qual banco criar

Recomendação: **Vercel Postgres** (o mais simples — é criado direto no painel da Vercel, já vem
com a variável `DATABASE_URL` configurada automaticamente no seu projeto). Alternativa
equivalente: **Neon** (mesmo motor Postgres, criar em neon.tech e copiar a connection string
manualmente).

Custo: ambos têm um plano gratuito para o volume de dados deste projeto hoje. Verifique os
limites do plano antes de confirmar a criação — isso é uma decisão sua, não foi criada nenhuma
conta por esta tarefa.

## 2. Como conectar à Vercel

**Se escolher Vercel Postgres:**
1. No painel do projeto na Vercel, vá em **Storage** → **Create Database** → **Postgres**.
2. Siga o assistente (nome do banco, região — escolha a mais próxima do Brasil disponível).
3. Ao terminar, a Vercel pergunta se quer conectar ao projeto `santa-monica-os` — confirme. Isso
   já cadastra `DATABASE_URL` automaticamente nas variáveis de ambiente do projeto.

**Se escolher Neon:**
1. Crie o banco em neon.tech.
2. Copie a "connection string" (começa com `postgresql://`).
3. No painel da Vercel: **Settings** → **Environment Variables** → adicione `DATABASE_URL` com
   esse valor, nos ambientes **Production** e **Preview** (e opcionalmente **Development**, se for
   testar localmente).

## 3. Quais variáveis cadastrar na Vercel

| Variável | Quando | O que é |
| --- | --- | --- |
| `DATABASE_URL` | Ao ativar o banco (passo 2) | Connection string do Postgres. Nunca cole aqui neste chat — cadastre direto no painel da Vercel. |
| `APP_ACCESS_ENABLED` | Ao ativar o gate temporário (passo 6) | `true` para ativar, ausente/qualquer outro valor = desativado. |
| `APP_ACCESS_USERNAME` | Junto com a anterior | Um usuário à sua escolha (ex.: `stamonica`). |
| `APP_ACCESS_PASSWORD` | Junto com a anterior | Uma senha forte, só sua. Troque periodicamente. |

Todas essas variáveis já estão documentadas (sem valores) em `.env.example` — é só usar os mesmos
nomes no painel da Vercel.

## 4. Como rodar as migrations (cria as tabelas) — ✅ já feito

Depois de `DATABASE_URL` estar configurada (pode ser rodando localmente com um arquivo
`.env.local`, obtido com `vercel env pull .env.local`, ou direto na Vercel):

```bash
npm install
npx tsx --env-file=.env.local src/db/migrate.ts
```

Isso cria as 25 tabelas descritas em `docs/database-architecture.md`. É seguro rodar mais de uma
vez — o Drizzle sabe quais migrations já foram aplicadas. (`npm run db:migrate` funciona igual,
desde que `DATABASE_URL` já esteja exportada no shell.)

## 5. Como aplicar os seeds — ✅ já feito

```bash
npx tsx --env-file=.env.local src/db/seed/inventory.ts          # os 48 itens da contagem física
npx tsx --env-file=.env.local src/db/seed/contracts.ts          # IESA/Nissan, Funerária, Don Juan
npx tsx --env-file=.env.local src/db/seed/chart-of-accounts.ts  # plano de contas + rodar por último
```

A ordem importa: `chart-of-accounts.ts` precisa rodar depois de `contracts.ts`, porque também
grava o movimento de caixa da IESA (vinculado à conta a receber criada pelo seed anterior). Se
rodado fora de ordem, ele apenas avisa e pula esse vínculo — nunca inventa. Todos os três são
idempotentes (seguro rodar de novo a qualquer momento).

## 6. Como criar o primeiro usuário `owner`

A tela de login completa ainda não está pronta (ver seção 7 abaixo), então o primeiro usuário
`owner` precisa ser criado diretamente no banco por enquanto. Usando o painel do seu provedor
(Vercel Postgres tem uma aba **Query** no painel; Neon tem um "SQL Editor"), rode:

```sql
INSERT INTO users (email, name, role)
VALUES ('seu-email@exemplo.com', 'Seu Nome', 'owner');
```

Isso cria o registro do proprietário, mas **ele ainda não terá senha/login funcional** — a coluna
`password_hash` fica vazia até a autenticação completa ser implementada (ver próxima seção). Este
passo serve para já deixar o registro pronto quando essa etapa for construída.

## 7. Como ativar autenticação

Existem dois níveis, e eles são independentes:

**Nível 1 — gate temporário (disponível agora, sem precisar de banco):**
1. No painel da Vercel, cadastre `APP_ACCESS_ENABLED=true`, `APP_ACCESS_USERNAME` e
   `APP_ACCESS_PASSWORD` (ver tabela do passo 3).
2. Faça um novo deploy (ou aguarde o deploy automático do próximo push).
3. Pronto — o site inteiro (exceto `/api/health`) passa a pedir usuário/senha no navegador.

**Nível 2 — autenticação completa com papéis (ainda não implementada):** depende de: (a) banco
configurado (passos 1–5 já feitos), (b) implementação de verificação de senha e sessão segura,
que é um próximo passo de desenvolvimento, não uma configuração — avise quando quiser priorizar
essa etapa. Enquanto isso, o Nível 1 é a proteção real do app.

## 8. Como validar

Depois de cada etapa:

- **Depois do passo 4 (migrations):** confira no painel do banco se as 25 tabelas apareceram
  (`users`, `inventory_items`, `contracts`, etc.). ✅ Confirmado em 10/07/2026.
- **Depois do passo 5 (seeds):** `SELECT COUNT(*) FROM inventory_items;` deve retornar `48`.
  `SELECT COUNT(*) FROM partners;` deve retornar `3`. `SELECT COUNT(*) FROM cash_movements;` deve
  retornar `1`. ✅ Confirmado em 10/07/2026 — ver `docs/next-session-handoff.md` para a lista
  completa de contagens.
- **Depois do passo 6 (gate temporário):** acesse o site em uma aba anônima — o navegador deve
  pedir usuário/senha antes de mostrar qualquer página. Acesse `/api/health` — deve continuar
  respondendo sem pedir senha.
- Verifique a página `/configuracoes/status` (nova, criada nesta execução) — ela mostra, sem
  expor valores sensíveis, se o banco está configurado, se o gate está ativo e o modo de
  armazenamento do estoque.

## 9. Como reverter se algo falhar

- **Migrations com erro:** normalmente é seguro rodar `npm run db:migrate` de novo depois de
  corrigir a causa (ex.: `DATABASE_URL` errada) — o Drizzle não reaplica migrations já
  concluídas.
- **Gate temporário travando o acesso (ex.: esqueceu a senha):** no painel da Vercel, mude
  `APP_ACCESS_ENABLED` para `false` (ou remova a variável) e faça um novo deploy — o site volta a
  ficar público imediatamente, sem precisar mexer em código.
- **Seed aplicado errado:** como os seeds são idempotentes por `external_id`, rodar de novo não
  piora nada. Para remover um registro específico incorreto, apague a linha diretamente pelo
  painel do banco (ex.: `DELETE FROM inventory_items WHERE external_id = '...'`).
- **Quer desfazer a conexão com o banco inteiramente:** remova `DATABASE_URL` das variáveis de
  ambiente da Vercel e faça um novo deploy — o app volta sozinho para o modo de armazenamento em
  memória (é exatamente assim que ele funciona hoje, sem banco nenhum).

## Dúvidas comuns

**"Preciso rodar isso tudo agora?"** Não. O app continua funcionando normalmente sem banco. Isso
é um roteiro para quando você decidir avançar — não uma obrigação imediata.

**"E se eu errar algum passo?"** Nenhuma ação aqui é destrutiva para os dados que já existem no
código (o estoque de 48 itens, os contratos) — eles continuam no repositório de qualquer forma.
