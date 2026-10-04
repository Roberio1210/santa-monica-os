import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "@/components/emergency/admin/contact-form";
import { ProtocolForm } from "@/components/emergency/admin/protocol-form";
import { ToggleActiveForm } from "@/components/emergency/admin/toggle-active-form";
import { getCurrentUser } from "@/lib/auth/session";
import { INSURANCE_COVERAGES } from "@/lib/emergency/insurance";
import { fetchEmergencyAdminData } from "@/lib/emergency/service";
import { EMERGENCY_CONTACT_CATEGORY_LABELS, isEmergencyContactCategory } from "@/lib/emergency/types";

/**
 * Administração da Central de Emergência (Fase 1) — contatos e protocolos. Sob `/configuracoes`,
 * que o middleware já bloqueia para OPERACIONAL (default-deny); aqui a página também é
 * fail-closed: sem sessão admin real, nem os dados nem os formulários são renderizados. A
 * segurança das escritas está nas server actions (`requireAdmin`).
 */
export const dynamic = "force-dynamic";

export default async function EmergenciaAdminPage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") {
    return (
      <div className="space-y-6">
        <PageHeader title="Central de Emergência — cadastros" />
        <Card>
          <CardContent className="pt-4 text-sm text-foreground-muted">
            Acesso restrito a administradores autenticados. A consulta da Central continua disponível em{" "}
            <Link href="/emergencia" className="underline">
              /emergencia
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const { contacts, protocols } = await fetchEmergencyAdminData();

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-8">
      <PageHeader
        title="Central de Emergência — cadastros"
        description="Contatos e protocolos exibidos em /emergencia. Toda alteração fica registrada na auditoria. Nada é excluído: desative o que não deve mais aparecer."
        actions={
          <Link href="/emergencia" className="text-sm underline">
            Ver Central
          </Link>
        }
      />

      <section className="space-y-3" aria-labelledby="admin-contatos">
        <h2 id="admin-contatos" className="text-lg font-semibold text-foreground">
          Contatos
        </h2>
        <details className="rounded-xl border border-border bg-background-panel p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Novo contato</summary>
          <div className="mt-4">
            <ContactForm />
          </div>
        </details>
        <ul className="space-y-2">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <details className="rounded-xl border border-border bg-background-panel p-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{contact.name}</span>
                  <span className="text-foreground-subtle">{isEmergencyContactCategory(contact.category) ? EMERGENCY_CONTACT_CATEGORY_LABELS[contact.category] : contact.category}</span>
                  {contact.phone ? <span className="tabular-nums text-foreground-muted">{contact.phone}</span> : <Badge variant="warning">Sem telefone</Badge>}
                  {!contact.active ? <Badge variant="outline">Inativo</Badge> : null}
                </summary>
                <div className="mt-4 space-y-4">
                  <ContactForm contact={contact} />
                  <ToggleActiveForm entity="contact" id={contact.id} active={contact.active} updatedAt={contact.updatedAt} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="admin-protocolos">
        <h2 id="admin-protocolos" className="text-lg font-semibold text-foreground">
          Protocolos
        </h2>
        <ul className="space-y-2">
          {protocols.map((protocol) => (
            <li key={protocol.id}>
              <details className="rounded-xl border border-border bg-background-panel p-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{protocol.title}</span>
                  <span className="text-foreground-subtle">{protocol.steps.length} passos</span>
                  {!protocol.active ? <Badge variant="outline">Inativo</Badge> : null}
                </summary>
                <div className="mt-4 space-y-4">
                  <ProtocolForm protocol={protocol} steps={protocol.steps} contacts={contacts} coverages={INSURANCE_COVERAGES} />
                  <ToggleActiveForm entity="protocol" id={protocol.id} active={protocol.active} updatedAt={protocol.updatedAt} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
