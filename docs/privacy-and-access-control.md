# Privacidade e controle de acesso — Santa Monica OS

Revisão feita em 10/07/2026, cobrindo placas, telefones, nomes, logs, rotas de API, páginas
públicas, headers e tratamento de erros.

## Máscaras (dados reais)

- `src/lib/utils/mask.ts` — `maskPlate` (mostra 2 primeiros + 2 últimos caracteres, resto
  mascarado) e `maskPhone` (mostra apenas os 2 últimos dígitos, **sempre mascarado, sem opção de
  revelar** — decisão deliberada: não existe sistema de permissão/autenticação hoje para gatear
  uma ação de "revelar" com segurança).
- Usadas em `src/lib/integrations/jumppark/service.ts`, na construção de `OperationOrder`
  (consumido por `/operacoes`) — todo dado real de cliente que chega à interface já sai mascarado
  da camada de serviço, antes de qualquer componente de UI.
- Dados demonstrativos (`src/data/mock/*`) já nascem pré-mascarados nos próprios arquivos
  (`phoneMasked`, `plateMasked`), não há dado fictício "cru" em lugar nenhum.
- Novo schema de banco (`src/db/schema/crm.ts`): `customers.phone` e `vehicles.plate` guardam o
  valor completo (necessário para operação real — cobrança, contato) — a máscara é
  responsabilidade da camada de apresentação, nunca do armazenamento. Isso é intencional: mascarar
  na gravação impediria qualquer uso legítimo futuro do dado completo (ex.: enviar WhatsApp real).
  Quando a autenticação completa existir, o acesso ao valor completo deve ser restrito por papel
  (`owner`/`manager`/`finance`), não por mascaramento irreversível no banco.

## Logs

- Nenhum `console.log`/`console.error`/`console.warn` existe no código do produto hoje (verificado
  nesta auditoria) — logs de erro seguem o padrão de `/api/jumppark/status`: apenas status HTTP e
  mensagem genérica, nunca o token ou o payload da requisição.
- `jumppark_sync_logs.errorMessage` (novo, `src/db/schema/jumppark.ts`) é uma coluna de texto
  explicitamente documentada como "sempre sanitizada — nunca deve conter token, header de
  autorização ou payload bruto". Isso é uma regra de disciplina de código a ser seguida quando a
  sincronização for implementada (`docs/jumppark-sync-strategy.md`), não uma garantia automática
  do banco.
- `audit_logs.beforeState`/`afterState` (jsonb) devem armazenar apenas o estado de campos de
  negócio (ex.: `{ currentQuantity: 5 }`), nunca senhas, tokens ou headers — a ser respeitado
  quando ações de auditoria forem implementadas.

## Tokens e IDs sensíveis

- Todas as credenciais (JumpPark, futuras integrações, `APP_ACCESS_PASSWORD`) vivem em variáveis
  de ambiente, nunca em código-fonte (verificado por varredura de segredos nesta execução — ver
  seção "Quality gate" no relatório final).
- `src/lib/config/env.ts` continua sendo o único ponto de leitura de credenciais JumpPark,
  importado apenas por módulos `server-only`.
- O gate temporário (`middleware.ts`) lê `APP_ACCESS_USERNAME`/`APP_ACCESS_PASSWORD` diretamente
  de `process.env`, nunca loga ou expõe esses valores — nem em caso de erro (headers malformados
  caem silenciosamente para a resposta 401 padrão).

## Rotas de debug

- Nenhuma rota de diagnóstico temporária existe no repositório
  (`/api/jumppark/debug-map` foi removida em `61265c8`, antes desta execução).
- As únicas rotas de API são `/api/health` (sem dado nenhum) e `/api/jumppark/status`
  (`configured`/`reachable`/`message` genérica — nunca token, userId ou establishmentId).
- Nova rota `/login` **não** é uma rota de debug — é a tela de login preparada (desativada), sem
  nenhuma lógica de autenticação real ainda (ver `docs/database-and-auth-setup-guide.md`).

## Páginas públicas

- Antes desta execução, 100% do app era publicamente acessível (ver
  `docs/current-state-audit.md`, seção 4).
- Agora existe um gate opcional (`middleware.ts` + `APP_ACCESS_ENABLED`) que, quando ativado,
  protege **todas** as páginas e rotas de API com Basic Auth, exceto `/api/health`. Desativado por
  padrão — o proprietário decide quando ligar (ver
  `docs/database-and-auth-setup-guide.md`, seção "Como ativar o gate temporário").
- Este gate é uma proteção temporária de baixo custo (usuário/senha únicos, sem papéis). A
  autenticação completa com papéis por pessoa (`owner`/`manager`/`parking`/`detailing`/
  `finance`/`hr`/`read_only`) depende de banco de dados e está preparada, mas desativada
  (`src/lib/auth/status.ts`, `src/app/login/page.tsx`).

## Headers

`next.config.ts` agora define, para todas as rotas:

| Header | Valor | Motivo |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Evita que o navegador reinterprete o tipo de um arquivo. |
| `X-Frame-Options` | `DENY` | Impede que o app seja carregado dentro de um `<iframe>` de terceiros (clickjacking). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Evita vazar a URL completa (que pode conter parâmetros) para sites de terceiros ao clicar em links. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Desativa APIs sensíveis do navegador que o app não usa. |

## Tratamento de erros

- `src/app/error.tsx` (novo) — error boundary genérico do App Router. Mostra apenas uma mensagem
  fixa e `error.digest` (identificador opaco gerado pelo Next.js, seguro para suporte/logs) —
  **nunca** `error.message` ou stack trace, que poderiam vazar detalhes internos (nomes de
  tabela, caminho de arquivo, etc.).
- Rotas de API seguem o mesmo princípio desde antes desta execução (`/api/jumppark/status`).

## Checklist desta revisão

- [x] Placas e telefones mascarados na apresentação de dados reais.
- [x] Nenhum log com dado pessoal ou credencial.
- [x] Nenhum token/ID sensível hardcoded ou exposto em resposta de API.
- [x] Nenhuma rota de debug pública.
- [x] Headers de segurança básicos aplicados globalmente.
- [x] Error boundary genérico sem vazamento de stack trace.
- [ ] App ainda publicamente acessível por padrão — mitigado pelo gate temporário opcional; a
      correção definitiva é ativar autenticação completa (Fase 1 do roadmap).
