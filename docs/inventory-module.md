# Módulo de Estoque — documentação

Primeira versão real do módulo de Estoque do Santa Monica OS, construída a partir da contagem
física realizada em 10/07/2026. Substitui, na rota `/estoque`, o antigo protótipo baseado em
`mockInventory`/`src/types/inventory.ts` — esses arquivos antigos foram deixados intactos porque
ainda são referenciados pelo dashboard (`src/app/dashboard/page.tsx`, cards demonstrativos de
"Itens críticos" e o bloco "Estoque"), que continua fora do escopo desta tarefa.

## Por que não há banco de dados

O projeto (`package.json`) não tem nenhuma dependência de banco de dados ou ORM, e `.env.example`
não define nenhuma variável de conexão. Por isso, esta primeira versão usa uma camada de
repositório (`InventoryRepository`, em `src/lib/inventory/repository.ts`) com uma implementação em
memória (`StaticInventoryRepository`, em `src/lib/inventory/static-repository.ts`) alimentada por
dados iniciais tipados no código (`src/lib/inventory/data/initial-count-2026-07-10.ts`).

**Limitação crítica**: em ambiente serverless (Vercel), não há garantia de memória compartilhada
entre invocações/cold starts. Isso significa que, mesmo que `recordMovement` esteja implementado,
uma movimentação registrada em produção pode não persistir na próxima requisição. Por isso a ação
de registrar movimentações manuais está **desabilitada na interface** (`/estoque`), embora toda a
lógica esteja pronta — habilitar exige banco de dados real + autenticação (ver seção "Como migrar
para banco de dados real").

### Recomendação de banco para a Vercel

Recomenda-se **Postgres gerenciado**, com duas opções equivalentes em custo/integração:
- **Vercel Postgres** (Neon por trás) — integração nativa via painel da Vercel, zero configuração
  de rede.
- **Neon** diretamente — mesmo motor, mais controle sobre planos/regiões.

Nenhum serviço foi criado e nenhuma credencial foi solicitada nesta tarefa — essa decisão exige
autorização explícita do proprietário antes de gerar custos ou expor credenciais.

## Modelo de dados

`src/lib/inventory/types.ts`:

- **`InventoryItem`**: `id`, `name`, `brand`, `category`, `currentQuantity`, `unit`,
  `packageCapacity` (capacidade de cada embalagem, `null` se não informado),
  `packageCount` (nº de embalagens que compõem a quantidade atual, `null` se não informado),
  `condition` (`lacrado` | `aberto` | `pela_metade` | `estimado`), `minimumStock` (`null` = "sem
  mínimo definido" — nunca inferido), `notes`, `lastCountDate`, `unitCost` (`null` quando não
  cadastrado).
- **`InventoryItemView`**: `InventoryItem` + campos calculados (`status`, `stockValue`,
  `fillPercent`), calculados em `src/lib/inventory/status.ts` e nunca persistidos.
- **`StockMovement`**: `id`, `itemId`, `type`, `quantity`, `unit`, `date`, `notes`, `responsible`.
  Para `ajuste_inventario`, `quantity` representa o **valor absoluto recontado**, não um delta —
  decisão deliberada documentada em código (`static-repository.ts`), diferente dos demais tipos
  (`entrada`/`compra` somam, `saida`/`perda`/`consumo_interno` subtraem).

## Categorias (14, fixas)

Lavagem; Higienização; Pneus e borrachas; Vidros; Couro; Plásticos; Polimento; Ceras e selantes;
Vitrificação; Motor e chassi; Boinas e acessórios; Equipamentos; EPIs; Outros.

A classificação de cada um dos 48 itens da contagem foi feita por inferência do nome/função do
produto (não havia campo de categoria na contagem original). Itens cuja categoria não era óbvia
(ex.: "Limpador de Pano", sprays de tinta automotiva) foram classificados como **Outros**, em vez
de forçar um encaixe duvidoso em outra categoria.

## Regras de status

`computeStatus` (`src/lib/inventory/status.ts`):

- `minimumStock === null` → **`sem_minimo`** ("Sem mínimo definido"). Esta é a regra mais
  importante do módulo: **nenhum estoque mínimo foi inventado**. Como a contagem de 10/07/2026 não
  informou mínimos para nenhum dos 48 itens, todos começam com este status.
- `currentQuantity <= minimumStock` → **`comprar`**.
- `currentQuantity <= minimumStock * 1.5` → **`atencao`**.
- caso contrário → **`ok`**.

Independente de `minimumStock`, o card "Itens próximos do fim" usa um cálculo separado
(`fillPercent <= 20%`, baseado em `currentQuantity / (packageCapacity × packageCount)`) — não
depende de um mínimo cadastrado, apenas da embalagem física informada na contagem. Itens sem
`packageCapacity` conhecida não entram nesse cálculo (ficam de fora, não são assumidos como cheios
ou vazios).

## Regras de interpretação da contagem física

- Quantidades em vírgula (ex.: "1,5 L") foram convertidas para ponto decimal.
- `packageCapacity`/`packageCount` só foram preenchidos quando a contagem explicitava o tamanho
  da embalagem ("embalagem de X", "frasco de X ml", "lata de X g"); combinações de embalagens
  heterogêneas ficaram com `packageCapacity: null` e a composição foi descrita em `notes`.
- `condition`:
  - `lacrado` quando o texto dizia explicitamente "lacrado"/"lacrada".
  - `estimado` quando o texto usava a palavra "estimado(s)/estimada(s)" para a quantidade total.
  - `pela_metade` quando o texto dizia "pela metade" sem usar a palavra "estimado".
  - `aberto` como padrão documentado, quando a contagem não informava a condição.
- Dois itens não tiveram o conteúdo líquido/peso informado ("Hard Cleaner Wax Xtreme", "Composto
  Polidor Extra Forte para Corte") — foram registrados como `1 unidade` física (contagem certa),
  com nota explicando que o volume/peso do conteúdo é desconhecido, em vez de estimar um valor.
- Correção de marca aplicada apenas quando inequívoca, conforme instrução: "Vonix" → "Vonixx" e
  "Easy Tech" → "EasyTech". Na prática, todas as 48 entradas da contagem já usavam a grafia
  canônica (`Vonixx`, `EasyTech`), então nenhuma correção precisou ser aplicada — a regra fica
  documentada para entradas futuras.

## Segurança

- A rota `/estoque` é somente leitura nesta versão: não há formulário funcional que altere dados.
- O formulário de "Movimentações manuais" é renderizado, mas todos os campos e o botão de
  submissão estão `disabled`, com explicação visível do motivo (sem banco real, sem autenticação).
- Nenhum dado pessoal de terceiros é exibido neste módulo (itens de estoque não têm dados de
  clientes).

## Limitações conhecidas

1. Nenhum item tem `minimumStock` ou `unitCost` cadastrado — por isso "Estoque baixo" mostra 0 e
   "Valor do estoque" mostra "Informação indisponível" até que esses dados sejam inseridos
   manualmente (fora do escopo desta tarefa; não há tela de edição ainda).
2. `StaticInventoryRepository` não persiste entre cold starts em produção (ver seção acima).
3. Categorização de itens foi inferida a partir do nome do produto — pode ser ajustada
   manualmente no futuro sem alterar a arquitetura.
4. Sem autenticação, qualquer futura tela de edição de estoque deve ser protegida antes de ir ao
   ar.

## Como evoluir para baixa automática por consumo de serviço

A arquitetura já separa `InventoryItem` (o produto) de `StockMovement` (o histórico de uso), então
o próximo passo natural é criar uma "ficha técnica de consumo" por serviço (ex.: "lavagem completa
consome 50 ml de V-Floc Shampoo + 1 boina de espuma"), e ao finalizar uma ordem de serviço no
JumpPark (`fetchTodayOperations`, em `src/lib/integrations/jumppark/service.ts`), gerar
`StockMovement`s do tipo `consumo_interno` automaticamente por serviço realizado. **Isso não foi
implementado nesta tarefa**, apenas a arquitetura foi deixada pronta para isso (tipos e repositório
já modelam o que é necessário).

## Como migrar para banco de dados real

1. Provisionar Postgres gerenciado (Vercel Postgres/Neon), com autorização do proprietário.
2. Criar tabelas `inventory_items` e `stock_movements` espelhando `InventoryItem`/`StockMovement`.
3. Implementar uma nova classe (`PostgresInventoryRepository`) que satisfaça a interface
   `InventoryRepository` já existente — nenhum componente de UI precisa mudar, pois consomem a
   interface via `src/lib/inventory/service.ts`.
4. Rodar uma migração única inserindo os 48 itens de `initial-count-2026-07-10.ts` como seed.
5. Trocar a instância exportada em `static-repository.ts` pela nova implementação (ou introduzir
   uma variável de ambiente para alternar entre as duas, durante a transição).
6. Habilitar o formulário de movimentações manuais na UI somente após autenticação estar
   implementada.
