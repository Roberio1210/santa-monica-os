import type { Supplier } from "@/lib/finance/types";

/**
 * Espelha exatamente o seed real de banco (src/db/seed/accounts-payable-foundation.ts). Nenhum
 * CNPJ/telefone/e-mail/endereço foi inventado — só o que foi informado pelo proprietário.
 */
export const initialSuppliers: Supplier[] = [
  { id: "fornecedor-mota-imobiliaria", name: "Mota Imobiliária", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-celesc", name: "Celesc", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-casan", name: "CASAN", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  {
    id: "fornecedor-jumppark",
    name: "JumpPark",
    contactName: "Sergio Felipe de Oliveira e Silva",
    taxId: "40841086850",
    phone: null,
    email: null,
    address: null,
    notes: null,
  },
  { id: "fornecedor-verisure", name: "Verisure", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-vivo-telefonia", name: "Vivo — Telefonia", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-vivo-internet", name: "Vivo — Internet", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-stylus-contabilidade", name: "Stylus Contabilidade", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-verde-car", name: "Verde Car", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-auto-leds", name: "Auto Leds", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
  { id: "fornecedor-mercado-livre", name: "Mercado Livre", contactName: null, taxId: null, phone: null, email: null, address: null, notes: null },
];
