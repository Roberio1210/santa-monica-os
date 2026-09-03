import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchGlobalSituation } from "@/lib/operations/central";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { SituationLevel } from "@/lib/operations/situation";
import "./globals.css";

/**
 * Missão UX/Navegação 4B — mesma fonte de verdade do badge da Central de Operações
 * (`computeSituation`/`computeConsolidatedAlerts`, `src/lib/operations/central.ts`), nunca um
 * texto fixo separado.
 *
 * Missão Performance 6B — trocado de `fetchCentralOverview` (overview completo, ~7 fontes) para
 * `fetchGlobalSituation` (mesma regra, mesmas fontes que afetam severidade, MENOS
 * `fetchClassificationQueue` — a única fonte que nunca produz alerta crítico/atenção, só
 * informativo, que `computeSituation` já ignora — ver comentário em `central.ts`). Toda função
 * de leitura por trás das duas é `React.cache()` por requisição, então em páginas que também
 * chamam `fetchCentralOverview` (ex.: `/dashboard`) as consultas compartilhadas continuam
 * deduplicadas — nenhuma consulta a mais nem a menos do que antes nesse caso. `null` só quando o
 * cálculo falha de verdade (ex.: banco fora do ar) — nesse caso o badge do cabeçalho simplesmente
 * não aparece, nunca finge "normal" sem ter certeza.
 */
async function computeGlobalSituation(): Promise<SituationLevel | null> {
  try {
    return await fetchGlobalSituation(saoPauloDateISO());
  } catch {
    return null;
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Santa Monica OS",
  description: "Central de gestão da Estética Automotiva e Estacionamento Sta. Mônica",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sempre null enquanto INDIVIDUAL_AUTH_ENABLED estiver desligado (nenhum cookie de sessão
  // individual existe) — AppShell/Sidebar/Header caem no comportamento anterior a esta missão.
  const [currentUser, situation] = await Promise.all([getCurrentUser(), computeGlobalSituation()]);

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AppShell currentUser={currentUser ? { name: currentUser.name, role: currentUser.role } : null} situation={situation}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
