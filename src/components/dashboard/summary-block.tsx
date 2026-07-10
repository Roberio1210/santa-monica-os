import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SummaryRow {
  label: string;
  value: string;
}

interface SummaryBlockProps {
  title: string;
  href: string;
  rows: SummaryRow[];
}

export function SummaryBlock({ title, href, rows }: SummaryBlockProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          Ver módulo <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pt-0">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-xs text-foreground-subtle">{row.label}</p>
            <p className="text-sm font-medium text-foreground">{row.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
