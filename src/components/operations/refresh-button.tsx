"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Recarrega os dados reais da Central (revalida a rota, sem cache de cliente). */
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justClicked, setJustClicked] = useState(false);

  function handleClick() {
    setJustClicked(true);
    startTransition(() => {
      router.refresh();
    });
    setTimeout(() => setJustClicked(false), 600);
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={isPending} aria-label="Atualizar dados da Central de Operações">
      <RefreshCw className={`h-4 w-4 ${isPending || justClicked ? "animate-spin" : ""}`} />
      Atualizar
    </Button>
  );
}
