import { Database, HardDriveDownload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StorageMode } from "@/lib/storage/mode";

/**
 * Aviso visual discreto de que os dados não estão em um banco persistente. Deliberadamente
 * não-alarmista (variant "outline"), mas sempre visível quando mode === "memory".
 */
export function StorageModeBadge({ mode }: { mode: StorageMode }) {
  if (mode === "postgres") {
    return (
      <Badge variant="positive">
        <Database className="h-3 w-3" />
        Banco de dados
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      <HardDriveDownload className="h-3 w-3" />
      Armazenamento temporário (memória)
    </Badge>
  );
}
