# Regras de classificação financeira das ordens JumpPark

Documenta e acompanha `src/lib/finance/classification.ts`, implementado em 10/07/2026 (Parte 7 da
execução do módulo Financeiro). **É só classificação — nenhuma sincronização automática, nenhuma
gravação em banco foi implementada aqui.** Ver `docs/jumppark-sync-strategy.md` para quando a
sincronização real for autorizada; quando isso acontecer, esta função é o que decide o campo de
classificação de cada `jumppark_service_orders` sincronizada.

## Categorias

| Categoria | Significado |
| --- | --- |
| `receita_estacionamento` | Pagamento imediato, só de estacionamento (sem serviços associados). |
| `receita_servicos` | Pagamento imediato, só de serviços/lavação (sem cobrança de estacionamento). |
| `parceria` | Cliente identificado como uma parceria pós-paga real e conhecida (hoje: IESA/Nissan). |
| `mensalista` | Cliente identificado como um contrato mensal real e conhecido (hoje: Funerária, Don Juan). |
| `pos_pago` | Situação financeira da ordem indica pagamento pendente/pós-pago, mas o cliente não bate com nenhum parceiro/mensalista conhecido. |
| `pagamento_imediato` | Situação paga, forma de pagamento informada, mas com receita mista (estacionamento + serviços) ou não separável. |
| `unclassified` | Nenhum dos sinais acima está disponível ou é confiável o suficiente. |

## A regra inegociável

**Nunca inferir `parceria` ou `mensalista` apenas porque a forma de pagamento está como
"dinheiro"** (ou qualquer outra forma). O JumpPark registra praticamente tudo — inclusive
lavações de parceiros pós-pagos — como "dinheiro" no momento da baixa operacional, porque o
sistema deles não distingue "recebi agora" de "vou faturar depois". Foi exatamente essa confusão
que motivou a nota do proprietário: *"registros da JumpPark lançados como 'dinheiro' não
significam necessariamente caixa recebido"*. Usar a forma de pagamento como sinal de parceria
reproduziria esse erro dentro do nosso próprio sistema.

## Como a classificação decide (em ordem)

1. **Cliente conhecido** (`knownParties`, curada manualmente a partir dos contratos reais já
   cadastrados em `src/lib/finance/data/contracts.ts`) → `parceria` ou `mensalista`. Esta é a
   **única** forma de uma ordem virar `parceria`/`mensalista` — nunca por inferência de forma de
   pagamento ou de valor.
2. Sem cliente conhecido, mas a situação financeira da ordem (`financialSituationName`/
   `operationSituationName`, vindo do JumpPark) indica pendência/pós-pago → `pos_pago`. Isso
   sinaliza "não sabemos quem é, mas o dado diz que não foi pago na hora" — informação real, não
   inventada.
3. Sem cliente conhecido, situação paga e forma de pagamento informada → `receita_estacionamento`
   ou `receita_servicos` quando o valor é claramente de um único tipo; `pagamento_imediato`
   quando é misto ou não dá para separar.
4. Nenhum dos sinais acima → `unclassified`. É o resultado esperado e correto quando o dado não é
   suficiente — não é um erro a "corrigir" inventando uma classificação.

## Lista curada de parceiros/mensalistas conhecidos

| Fragmento do nome do cliente | Classificação |
| --- | --- |
| `iesa` | `parceria` |
| `nissan` | `parceria` |
| `funerár` / `funerar` | `mensalista` |
| `don juan` | `mensalista` |

Atualizar esta lista (em `src/lib/finance/classification.ts`) manualmente sempre que um novo
contrato real for confirmado pelo proprietário — nunca gerar essa lista automaticamente a partir
de dados históricos sem confirmação humana.

## Limitações conhecidas

- O nome do cliente no JumpPark pode não bater exatamente com o nome do parceiro cadastrado
  (erro de digitação, nome de motorista em vez de empresa, etc.) — nesses casos a ordem cai para
  `pos_pago`/`unclassified` em vez de `parceria`, o que é o comportamento correto e seguro (evita
  falso positivo), mas pode subcontar o volume real de uma parceria até o cadastro ser ajustado.
- `pagamento_imediato` (receita mista) não separa quanto é estacionamento e quanto é serviço —
  isso já está disponível em `OperationOrder.parkingAmount`/`servicesAmount`, então não se perde
  informação, só não há uma categoria única para o caso misto.
