# Mapeamento de dados — API JumpPark

Levantamento feito consultando a integração real em produção (`santa-monica-os.vercel.app`)
em 2026-07-10, via uma rota de diagnóstico temporária e sanitizada (removida após este
levantamento). Amostra: relatório financeiro do dia 2026-07-09 e 1.708 ordens de serviço
entre 2026-01-01 e 2026-07-10.

Nenhum valor real de placa, telefone, e-mail, nome de cliente ou operador aparece neste
documento — todos os exemplos abaixo foram generalizados ou mascarados manualmente.

## 1. `GET /reports/financial?startDate&endDate`

### Estrutura observada (`data`)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `cashFlow.entry` / `.exit` / `.balance` | number | Saldo de caixa do período. `balance` bateu exatamente com o total geral no dia testado. |
| `serviceOrders.total` / `.totalAmount` / `.content[]` | number / number / array | **Somente a parcela de estacionamento** (ordens sem serviço). No dia testado: 9 ordens, R$ 322. |
| `services.total` / `.totalAmount` / `.content[]` | number / number / array | **Somente a parcela de lavação/serviços.** No dia testado: 10 itens, R$ 4.100. `content[]` pode trazer `serviceCategories` (array de IDs). |
| `invoices.total` / `.totalAmount` / `.content.paidOut` | number / number / object | Faturas — zerado na amostra; estrutura de `content` é um objeto (não array), diferente de `services`/`serviceOrders`. |
| `discounts.total` / `.totalAmount` / `.content[]` | number / number / array | Descontos aplicados no período. |
| `products` | `null` na amostra | Sem exemplo populado — estrutura desconhecida. |
| `paymentMethods.total` / `.totalAmount` / `.content[]` | number / number / array | **Total geral do dia** (bateu com `cashFlow.balance`: R$ 4.422). Cada item de `content[]` tem `paymentMethodName`, `total`, e `totalAmount` — **atenção**: `totalAmount` agregado é `number`, mas dentro de `content[]` vem como **string** (`"546.00"`). |
| `exitCategory`, `entryCategory`, `reservations` | `null` na amostra | Sem exemplo populado. |

### ⚠️ Achado crítico: `data.services.totalAmount` não é o faturamento total

A implementação atual (`fetchDailyFinancial` / `fetchOverviewMetrics` em
`src/lib/integrations/jumppark/service.ts`) usa `data.services.totalAmount` como "receita
total do dia". No dia testado isso retornaria **R$ 4.100**, mas o faturamento real do dia
foi **R$ 4.422** (confirmado por `cashFlow.balance` e `paymentMethods.totalAmount`), porque
`services` exclui a receita pura de estacionamento (R$ 322, que fica em `serviceOrders`).

```
serviceOrders.totalAmount (322) + services.totalAmount (4100) = paymentMethods.totalAmount (4422)
```

**Isso não foi alterado nesta tarefa** (apenas mapeamento), mas é um bug real na leitura de
receita hoje/mês exibida no dashboard. Ver recomendações.

## 2. `GET /serviceorders/export/json?startDate&endDate`

### Campos observados em cada ordem (união de chaves em 1.708 registros)

| Campo | Presente | Observação |
| --- | --- | --- |
| `serviceOrderId` | ✅ | ID interno longo (ex.: composto por código + timestamp). |
| `serviceOrderCode` | ✅ | Código curto, aparentemente voltado ao operador/recibo. Há **dois IDs de ordem**, não um. |
| `entryDateTime` | ✅ | `"YYYY-MM-DD HH:mm:ss"`. |
| `exitDateTime` | ✅ (ausente/vazio quando ainda no pátio) | Mesmo formato de `entryDateTime`. |
| `plate` | ✅ | Placa completa (mascarada em qualquer exibição/log). |
| `vehicleModel`, `vehicleColor` | ✅ | Texto livre do painel JumpPark. |
| `clientName` | ⚠️ presente, mas frequentemente `null` | Nos 6 exemplos amostrados, sempre `null` — sugere que a maioria das ordens de walk-in não tem cliente cadastrado vinculado. |
| `clientPhone`, `clientEmail` | ⚠️ chave existe na união, não populada nos exemplos amostrados | Provavelmente só preenchida quando há cadastro de cliente (mensalista/parceria). Não observado com valor real nesta amostra. |
| `services[]` | ✅ | Array; vazio = ordem sem serviço agregado (estacionamento puro). Cada item: `description`, `quantity`, `amount`, `serviceContractId`, `commissioners`, `serviceOrderId`. |
| `amount` | ✅ | Valor da **parcela de estacionamento** da ordem. |
| `amountServices` | ✅ | Valor da **parcela de serviços/lavação** da ordem. |
| `totalAmount` | ✅ | `amount + amountServices`. |
| `paymentMethodName` | ✅ | Texto (`"Crédito"`, `"Débito"`, `"Dinheiro"` observados). |
| `situationId` | ✅ | Código numérico (só `2` observado na amostra — significado dos demais valores não confirmado). |
| `financialSituationId` / `financialSituationName` | ✅ | Só `3` / `"Pago"` observado — outros estados (pendente, faturado) não confirmados nesta amostra. |
| `operationSituationName` | ✅ | Só `"Fora do pátio"` observado (todas as ordens amostradas já tinham saída). |
| `discountId`, `discountAmount`, `discountType` | ✅ | `null`/`0` em todos os exemplos — sem caso populado. |
| `typePrice` | ✅ | `null` ou `"TABELA NOVA"` observados — possível indicador de tabela de preço (mensalista?), não confirmado. |
| `cardCode` | ✅ | `0` em todos os exemplos — possível referência a cartão/mensalidade quando ≠ 0, não confirmado. |
| `userName`, `userOutputName` | ✅ | Operador de entrada/saída (nome do funcionário, não do cliente). |
| `observations` (objeto) | ✅ | `{ observation, editObservation, cancelObservation, deleteObservation, changePriceObservation }` — todas vazias na amostra; estrutura confirmada, conteúdo não. |
| `establishmentId`, `establishmentName` | ✅ | Fixos para a conta. |

### Campos ausentes (pedidos pela tarefa, não encontrados na API)

- **Chassi** — nenhuma chave relacionada (`chassi`, `chassis`, `vin`) apareceu na união de 1.708 registros. Não disponível.
- **Tipo de veículo** (carro/moto/caminhão) — não há campo estruturado; só `vehicleModel` (texto livre) e `vehicleColor`. Precisaria ser inferido do texto do modelo, com risco de erro — recomenda-se tratar como "Informação indisponível" em vez de inferir.

### Exemplo sanitizado — ordem com serviço (lavação)

```json
{
  "serviceOrderId": "[id-composto]",
  "serviceOrderCode": "[código-curto]",
  "plate": "RK***04",
  "vehicleModel": "COROLLA CROSS",
  "vehicleColor": "VERMELHO",
  "entryDateTime": "2026-07-09 18:31:47",
  "exitDateTime": "2026-07-09 18:46:33",
  "amount": "0.00",
  "amountServices": "180.00",
  "totalAmount": 180,
  "situationId": 2,
  "financialSituationName": "Pago",
  "operationSituationName": "Fora do pátio",
  "clientName": null,
  "paymentMethodName": "Crédito",
  "services": [
    { "description": "Lavação Silver - SUV", "quantity": 1, "amount": "180.00" }
  ]
}
```

### Exemplo sanitizado — ordem sem serviço (estacionamento puro)

```json
{
  "serviceOrderId": "[id-composto]",
  "serviceOrderCode": "[código-curto]",
  "plate": "RY***52",
  "vehicleModel": "RENAULT DUSTER",
  "entryDateTime": "2026-07-09 20:22:49",
  "exitDateTime": "2026-07-09 22:52:46",
  "amount": "40.00",
  "amountServices": "0.00",
  "totalAmount": 40,
  "paymentMethodName": "Débito",
  "services": []
}
```

### Exemplo real de "parceria" encontrado em texto livre

Um dos serviços amostrados tinha `description: "Lavação Parceria IESA - Nissan"` — ou seja,
parceria aparece **dentro do texto livre de `services[].description`**, não como campo
estruturado dedicado.

## 3. Como diferenciar cada situação

| Situação | Como identificar | Confiança |
| --- | --- | --- |
| Veículo ainda no pátio | `exitDateTime` ausente/vazio | Alta (lógica), mas **nenhum exemplo real com veículo aberto foi observado nesta amostra** — ver limitação abaixo |
| Ordem finalizada | `exitDateTime` presente + `operationSituationName: "Fora do pátio"` + `financialSituationName: "Pago"` | Alta (padrão consistente nos 6 exemplos) |
| Lavação / serviço | `services[]` não vazio **e/ou** `amountServices > 0` | Alta — `amountServices` é mais confiável que checar o array, pois já vem separado por valor |
| Estacionamento | `services[]` vazio **e/ou** `amount > 0` com `amountServices = 0` | Alta |
| Serviço adicional (add-on) | Mais de um item em `services[]` | Não observado na amostra (todos os exemplos tinham 0 ou 1 item), mas suportado pela estrutura de array |
| Mensalista | Hipótese: `cardCode ≠ 0` e/ou `typePrice` com valor específico (ex. algo como "MENSALISTA") | **Não confirmado** — nenhum exemplo com esses valores populados apareceu na amostra |
| Parceria | Hipótese: texto livre em `services[].description` contendo "Parceria" (1 exemplo confirmado) | Baixa — não é campo estruturado, depende de correspondência de texto |
| Pagamento à vista | `paymentMethodName` em Dinheiro/Débito/Crédito/Pix + `financialSituationName: "Pago"` no mesmo dia | Alta para os casos observados |
| Pós-pago / faturado | Hipótese: `financialSituationId`/`financialSituationName` com valor diferente de "Pago" (ex. "Pendente", "Faturado") | **Não confirmado** — todos os 1.708 registros testados retornaram `financialSituationId: 3` ("Pago") |

## 4. Limitações

1. **`data.services.totalAmount` ≠ faturamento total do dia** — exclui a receita de
   estacionamento puro (ver achado crítico acima). Afeta diretamente os cards "Receita hoje"
   e "Receita no mês" já implementados no dashboard.
2. **Nenhuma ordem "ainda no pátio" foi retornada em 1.708 registros ao longo de ~6 meses**
   (`stillOpen: 0`). Isso é um sinal forte de que `/serviceorders/export/json` pode **não
   incluir ordens em aberto** (sem `exitDateTime`) — o que invalidaria o cálculo atual de
   "veículos no estacionamento" (implementado na sessão anterior) baseado em filtrar
   `!exitDateTime` nesse endpoint. Precisa ser testado novamente em horário de pico, com
   veículos confirmadamente no pátio no momento da consulta, para confirmar se a API os
   retorna ou não.
3. **Sem exemplo populado para**: `products`, `exitCategory`, `entryCategory`, `reservations`,
   `discountId/Amount/Type` diferente de zero, `clientPhone`/`clientEmail` com valor real,
   `situationId`/`financialSituationId` com valores diferentes de 2/3, `cardCode` diferente de
   0, `typePrice` diferente de "TABELA NOVA"/null. A ausência de exemplo não significa que o
   campo não existe — só que não apareceu na amostra testada.
4. **Chassi e tipo de veículo não existem na API** — precisam continuar como "Informação
   indisponível" na interface, nunca inferidos.
5. **Dois IDs de ordem coexistem** (`serviceOrderId` longo, `serviceOrderCode` curto) — é
   preciso decidir qual usar como chave primária/exibição antes de modelar o tipo TypeScript.
6. **Tipagem inconsistente**: valores monetários aparecem ora como `number` (`totalAmount`
   no nível da ordem), ora como `string` (`"180.00"` em `amount`/`amountServices`, e dentro de
   `paymentMethods.content[].totalAmount`). Qualquer nova implementação precisa normalizar
   com `Number(...)` de forma consistente (o código atual já faz isso parcialmente).

## 5. Recomendações

1. **Corrigir o cálculo de receita** para somar `serviceOrders.totalAmount + services.totalAmount`
   (ou usar diretamente `paymentMethods.totalAmount`, que já é o total agregado) em vez de só
   `services.totalAmount`. Não implementado nesta tarefa — só documentado.
2. **Investigar se existe um endpoint dedicado para "veículos atualmente no pátio"** antes de
   confiar em `/serviceorders/export/json` para esse dado — consultar a documentação
   (`https://docs.jumpparkapi.com.br/public/`) por algo como `/parking/current` ou similar, já
   que a amostra sugere que ordens abertas podem não aparecer nesse endpoint.
3. **Preferir `amount`/`amountServices` em vez de inspecionar `services[]`** para separar
   receita de estacionamento vs. lavação — é mais direto e evita a lógica de rateio
   proporcional usada no script Python legado.
4. **Tratar `clientName`, `clientPhone`, `clientEmail` como frequentemente indisponíveis** —
   exibir "Informação indisponível" quando `null`, em vez de assumir que sempre virão
   preenchidos.
5. **Não implementar diferenciação de mensalista/parceria/pós-pago ainda** — os candidatos
   (`cardCode`, `typePrice`, texto livre em `services[].description`, `financialSituationName`)
   precisam de mais amostras reais antes de virar lógica de produto, para não classificar
   errado.
6. **Definir qual `serviceOrderId` vs `serviceOrderCode` usar como identificador** antes de
   estender os tipos TypeScript (`src/lib/integrations/jumppark/types.ts`), que hoje não
   modelam nenhum desses IDs.
7. Nenhuma mudança de interface foi feita nesta tarefa, conforme solicitado — este documento é
   só a base para a próxima etapa de implementação.
