import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportUploadForm } from "@/components/inventory/audit/import-upload-form";
import { PURCHASE_IMPORT_COLUMNS } from "@/lib/inventory/purchase-import-format";

export const dynamic = "force-dynamic";

const COLUMN_DESCRIPTIONS: Record<(typeof PURCHASE_IMPORT_COLUMNS)[number], string> = {
  identificador_externo: "Id da compra no sistema de origem, quando existir (opcional).",
  data: "Data da compra — YYYY-MM-DD ou DD/MM/AAAA (obrigatório).",
  numero_nota: "Número da nota fiscal (opcional, mas recomendado).",
  fornecedor: "Nome do fornecedor (opcional, mas recomendado).",
  cnpj_fornecedor: "CNPJ do fornecedor (opcional).",
  chave_nfe: "Chave de acesso da NF-e, quando disponível — melhor forma de evitar duplicidade (opcional).",
  produto: "Nome do produto exatamente como está na nota (obrigatório).",
  marca: "Marca do produto (opcional).",
  quantidade_embalagens: "Quantidade de embalagens compradas — número maior que zero (obrigatório).",
  volume_ou_peso_por_embalagem: "Volume/peso/quantidade de cada embalagem — número maior que zero (obrigatório).",
  unidade_embalagem: "Unidade da embalagem: ml, l, g, kg, unidade, caixa (obrigatório).",
  valor_unitario_embalagem: "Valor pago por cada embalagem (opcional).",
  valor_total_item: "Valor total do item na nota (opcional).",
  frete_rateado: "Frete rateado para este item (opcional).",
  desconto_rateado: "Desconto rateado para este item (opcional).",
  observacao: "Observação livre (opcional).",
};

export default function ImportarComprasPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Importar compras históricas" description="Etapa 1 de 2 — prévia. Nada é gravado no estoque até a confirmação, linha por linha, na próxima etapa." />

      <Card>
        <CardHeader>
          <CardTitle>Enviar arquivo</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-3 text-xs text-foreground-subtle">Aceita CSV ou JSON (array de objetos) com as colunas abaixo. Nenhuma leitura automática de PDF/imagem — o arquivo precisa já estar estruturado.</p>
          <ImportUploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formato oficial das colunas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-foreground-subtle">
                  <th className="py-1.5 pr-4 font-medium">Coluna</th>
                  <th className="py-1.5 font-medium">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {PURCHASE_IMPORT_COLUMNS.map((column) => (
                  <tr key={column} className="border-b border-border-subtle/50">
                    <td className="py-1.5 pr-4 font-mono text-foreground">{column}</td>
                    <td className="py-1.5 text-foreground-muted">{COLUMN_DESCRIPTIONS[column]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
