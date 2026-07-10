# Modelo de dados — Santa Monica OS

Tipos definidos em `src/types/`. Nesta fase, todos os dados são demonstrativos
(`src/data/mock/`); os tipos já refletem o formato esperado das integrações reais.

| Entidade | Arquivo | Descrição |
| --- | --- | --- |
| `Customer` | `customer.ts` | Cliente, segmentação e histórico agregado |
| `Vehicle` | `vehicle.ts` | Veículo vinculado a um cliente |
| `ServiceOrder` / `WashSummary` | `service.ts` | Ordens de serviço da lavação |
| `FinanceSummary` / `RevenuePoint` | `finance.ts` | Indicadores financeiros e séries de receita |
| `ParkingEntry` / `ParkingSummary` | `parking.ts` | Movimentação e ocupação do estacionamento |
| `ScheduleEntry` | `schedule.ts` | Agendamentos e ocupação da agenda |
| `InventoryItem` | `inventory.ts` | Produtos, consumo e status de estoque |
| `PurchaseOpportunity` | `purchase.ts` | Oportunidades de compra (Mercado Livre) |
| `Campaign` / `MarketingSummary` | `marketing.ts` | Campanhas de marketing e desempenho |
| `AgentProfile` / `AgentRecommendation` / `AgentAuditLog` | `agent.ts` | Agentes e recomendações |
| `Camera` | `camera.ts` | Câmeras de segurança (módulo Vigia) |
| `RadarAlert` | `alert.ts` | Alertas do Radar |
| `DataMeta`, `Trend`, `PaymentMethod`, `AlertSeverity` | `common.ts` | Tipos compartilhados |

## Convenções

- Placas e telefones são armazenados/exibidos sempre mascarados (`plateMasked`, `phoneMasked`).
- Valores monetários em `number` (reais, com casas decimais), formatados na camada de
  apresentação (`src/lib/utils/format.ts`).
- Datas em ISO 8601 (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm:ssZ`).

## Origem futura dos dados (JumpPark)

O mapeamento de campos da API JumpPark para os tipos internos ocorre em
`src/lib/integrations/jumppark/service.ts`, isolando o formato bruto da API do modelo de domínio
usado pela interface.
