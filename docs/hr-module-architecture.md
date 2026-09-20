# Arquitetura do módulo de RH — Santa Monica OS

Preparação de arquitetura (sem implementação de tela ainda), feita em 10/07/2026. Modela duas
trilhas **completamente separadas** — CLT e PJ — porque as obrigações, documentos e regras legais
de cada uma são diferentes por natureza. Misturar os dois modelos criaria confusão operacional e
risco trabalhista.

## Situação real (10/07/2026)

- 1 funcionário CLT no estacionamento.
- 3 prestadores PJ na lavação.
- Contratos de prestação de serviço dos PJs estão sendo finalizados (ainda não assinados/
  vigentes na data desta execução — por isso nenhum seed de dados reais de RH foi criado, apenas
  a estrutura).

## Por que duas tabelas, não uma

CLT (`employees`) e PJ (`contractors`) têm campos, obrigações e ciclos de vida diferentes:

| | CLT (`employees`) | PJ (`contractors`) |
| --- | --- | --- |
| Vínculo | Empregatício, regido pela CLT | Contratual, prestação de serviço (autônomo ou empresa) |
| Documento principal | Admissão, carteira de trabalho | Contrato de prestação de serviço, CNPJ/CPF |
| Remuneração | Salário fixo + benefícios | Valor combinado por contrato ou comissão |
| Jornada | Registrada (jornada, faltas, atestados) | Não aplicável — entregas/escopo, não horário |
| Encerramento | Rescisão | Fim de vigência do contrato / não renovação |
| Nota fiscal | Não emite | Emite (pessoa jurídica) ou RPA (pessoa física) |

Uma tabela única forçaria campos `nullable` cruzados (jornada de um PJ não faz sentido, CNPJ de um
CLT não faz sentido) e regras de negócio (`computeStatus`, alertas de vencimento, etc.) que
precisariam de `if (isPJ)` espalhados pelo código — exatamente o tipo de acoplamento que a
arquitetura deste projeto evita (ver `docs/architecture.md`, princípio 1: modularidade).

## Modelo de dados

Ver `src/db/schema/hr.ts` (schema Drizzle) para a definição exata dos campos. Resumo:

### `employees` (CLT)

- Dados cadastrais: `fullName`, vínculo opcional com `users` (`userId`).
- `role` — cargo.
- `admissionDate` — data de admissão.
- `workSchedule` — jornada (texto livre nesta fase; pode virar estrutura própria depois).
- `baseSalary` — salário base. **Nullable, nunca inventado.**
- `active` — permite desligar sem apagar histórico (rescisão = `active: false`, nunca `DELETE`).

Férias, faltas, atestados, exames, advertências e demais documentos **não são colunas de
`employees`** — vivem em `employee_documents` (ver abaixo), porque são eventos que se repetem ao
longo do tempo (um funcionário tem várias férias, vários atestados), não um único valor por
funcionário.

### `contractors` (PJ)

- `businessName` — nome do prestador ou razão social da empresa.
- `type` — `pessoa_fisica` ou `pessoa_juridica`.
- `taxId` — CPF ou CNPJ.
- `scope` — escopo do serviço contratado.
- `agreedValue` — valor fixo mensal ou base de comissão. **Nullable, nunca inventado.**
- `contractStart` / `contractEnd` — vigência.

Renovações são modeladas como um novo período de vigência (`contractStart`/`contractEnd`) — a
decisão de criar uma nova linha vs. atualizar a existente fica para quando a tela de RH for
implementada; nesta fase só a coluna existe.

Notas fiscais, pagamentos e documentos de PJ também passam por `employee_documents`
(`documentType: "nota_fiscal"`) e futuramente pela tabela `payments` já modelada para o módulo
financeiro (`src/db/schema/finance.ts`) — não foi criada uma tabela de pagamento duplicada
exclusiva para PJ.

### `employee_documents` (compartilhada, mas com `subjectType`)

Um único lugar para todo documento de RH, tanto CLT quanto PJ, diferenciado por `subjectType`
(`employee` ou `contractor`) + `subjectId`:

- `documentType`: `contrato`, `exame`, `atestado`, `advertencia`, `nota_fiscal`, `identidade`,
  `ferias`, `outro`.
- `fileRef` — referência ao arquivo (upload ainda não implementado nesta fase).
- `issueDate` / `expiresAt` — permite alertas futuros de vencimento (ex.: exame periódico,
  contrato PJ perto do fim).

`subjectId` é **polimórfico** (aponta para `employees.id` ou `contractors.id` dependendo de
`subjectType`) e por isso não tem uma foreign key de banco — a integridade é responsabilidade da
camada de aplicação quando a tela for implementada. Isso é uma limitação conhecida e documentada,
não um esquecimento (ver `docs/database-architecture.md`).

## O que NÃO foi implementado nesta execução

- Nenhuma tela de RH (`/rh` ou similar) foi criada.
- Nenhum dado real de funcionário/prestador foi cadastrado — os 3 contratos PJ ainda estão sendo
  finalizados, e não há autorização para registrar dados pessoais (CPF, salário) sem confirmação
  explícita do proprietário.
- Upload de documentos (`fileRef`) não tem armazenamento configurado — ficará para quando um
  provedor de armazenamento de arquivo (ex.: Vercel Blob) for decidido.
- Cálculo de férias, 13º, rescisão ou qualquer regra trabalhista automatizada — fora de escopo
  desta fundação técnica; quando implementado, deve ser revisado por um contador/departamento
  pessoal, não inferido pelo sistema.

## `employee_payments` — categorias e regras de negócio (Missão 86 + Missão DP, 20/09/2026)

Implementado depois desta fundação técnica: `employee_payments`/`employee_advances` (ver
`src/db/schema/hr.ts`) nunca duplicam o financeiro — `cashMovementId` sempre aponta para o
`cash_movements` real quando existe. A categoria (`employeePaymentCategoryEnum`) separa
conceitualmente: `salario_fixo`, `comissao`, `bonus`, `diaria_freelancer`, `adiantamento`,
`beneficio_auxilio`, `reembolso`, `desconto_compensacao`, `rescisao`, `ferias`,
`decimo_terceiro`, `encargo`, `outro` — nunca somadas cegamente (ver `src/lib/hr/costSummary.ts`).

`beneficio_auxilio` existe para vale-transporte/vale-alimentação e benefícios semelhantes,
deliberadamente distinto de `salario_fixo` (remuneração-base) — nunca atribuído por inferência de
valor, só por decisão explícita registrada.

**Regra de timing de comissão/meta**: histórico (até o ciclo de agosto/2026) pago por volta do dia
10 do mês seguinte à competência; a partir do próximo ciclo passa a ser pago no dia 15 — mudança
só prospectiva, nunca reabre competências já fechadas. Não há automação de pagamento nem conta a
pagar automática para isso — é regra observada manualmente até que exista demanda real de
automatizar.

**Data de pagamento x competência**: `date` é sempre a data de caixa (quando o dinheiro saiu de
verdade); `competenceDate` é a competência econômica quando diferente. `/departamento-pessoal`
(`getDpOverview`) filtra por `date` por padrão (mesma lógica do Livro Caixa) — um pagamento de
R$450 feito em 31/08 com competência setembro aparece no card de "agosto" da tela (foi pago em
agosto), nunca some do caixa por causa da competência. `listEmployeePayments` também aceita
`competenceDateFrom`/`competenceDateTo` para quem precisa responder "quanto pertence
economicamente a este mês" em vez de "quanto saiu do caixa este mês" — os dois filtros nunca devem
ser combinados na mesma chamada (respondem perguntas diferentes).

## Papéis de acesso relacionados

O papel `hr` (ver `docs/privacy-and-access-control.md` e a Fase 1 do roadmap) deve ser o único com
permissão de leitura/escrita neste módulo quando a autenticação completa estiver ativa — dados de
CLT (salário, CPF) e PJ (CNPJ, valores de contrato) são sensíveis e não devem ser visíveis para
papéis operacionais (`parking`, `detailing`).

## Próximo passo

Quando os contratos PJ forem assinados e o proprietário autorizar o cadastro, a implementação da
tela consiste em: (1) formulário de cadastro de `employees`/`contractors` (dois formulários
distintos, não um formulário condicional); (2) listagem de `employee_documents` por pessoa; (3)
alertas de vencimento (exame, contrato) usando a tabela `alerts` já modelada. Nenhuma dessas
telas deve ir ao ar sem autenticação funcionando (Fase 1 do roadmap).
