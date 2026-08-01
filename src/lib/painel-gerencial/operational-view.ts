/**
 * Único ponto do Painel Gerencial autorizado a exibir placa e telefone SEM máscara.
 *
 * Política global do projeto (`@/lib/utils/mask.ts`, `maskPlate`/`maskPhone`): placa e telefone
 * são mascarados por padrão em toda tela e em todo domínio (ver
 * docs/business-core-architecture-rfc.md, Achado de tensão de mascaramento). Esta função NÃO
 * altera essa política global — ela cria uma exceção explícita, documentada e restrita:
 *
 * - Uso permitido apenas dentro de `src/lib/painel-gerencial/**` e dos componentes da tela
 *   `/painel-gerencial`, que vive inteiramente atrás do gate de autenticação do app
 *   (`APP_ACCESS_ENABLED`, ver `src/lib/auth/status.ts`).
 * - O proprietário precisa do dado completo para uso operacional real (retornar ligação,
 *   confirmar veículo na baia) — mascarar aqui removeria utilidade sem ganho de segurança real,
 *   já que a tela só é acessível a quem já passou pelo gate.
 * - Nunca usar esta função para preencher `metadata`, logs, ou qualquer campo que possa ser
 *   persistido, enviado ao Zézinho ou exposto fora da área autenticada.
 */
export function unmaskForOperationalView(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
