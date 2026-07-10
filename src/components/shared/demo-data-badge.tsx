import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Sinaliza que os dados exibidos são fictícios, conforme princípio de transparência. */
export function DemoDataBadge() {
  return (
    <Badge variant="warning">
      <FlaskConical className="h-3 w-3" />
      Dados demonstrativos
    </Badge>
  );
}
