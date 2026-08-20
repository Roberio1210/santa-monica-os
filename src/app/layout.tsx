import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import "./globals.css";

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
  const currentUser = await getCurrentUser();

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AppShell currentUser={currentUser ? { name: currentUser.name, role: currentUser.role } : null}>{children}</AppShell>
      </body>
    </html>
  );
}
