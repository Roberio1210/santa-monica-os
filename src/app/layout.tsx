import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { computeConsolidatedAlerts, computeSituation, fetchCentralOverview } from "@/lib/operations/central";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { SituationLevel } from "@/lib/operations/situation";
import "./globals.css";

/**
 * Missão UX/Navegação 4B — mesma fonte de verdade do badge da Central de Operações
 * (`computeSituation`/`computeConsolidatedAlerts`, `src/lib/operations/central.ts`), nunca um
 * texto fixo separado. `fetchCentralOverview` é cacheada por requisição (`React.cache`), então
 * chamá-la aqui não duplica as consultas quando a página visitada também for `/dashboard`.
 * `null` só quando o cálculo falha de verdade (ex.: banco fora do ar) — nesse caso o badge do
 * cabeçalho simplesmente não aparece, nunca finge "normal" sem ter certeza.
 */
async function computeGlobalSituation(): Promise<SituationLevel | null> {
  try {
    const overview = await fetchCentralOverview(saoPauloDateISO());
    return computeSituation(computeConsolidatedAlerts(overview));
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
