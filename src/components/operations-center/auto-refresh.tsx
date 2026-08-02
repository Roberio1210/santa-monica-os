"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Revalida a rota a cada `intervalMs` — sem recarregar a página, sem interação do usuário. */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
