import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/frontend/components/ui/card";
import { cn } from "@/frontend/ui/cn";

export function AdminKpi({
  title,
  value,
  hint,
  change,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  change?: number;
  icon: LucideIcon;
}) {
  const positive = (change ?? 0) >= 0;
  const Trend = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xl font-bold break-words text-foreground sm:text-2xl">{value}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{hint}</span>
        {change != null && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-accent" : "text-danger")}>
            <Trend className="h-3.5 w-3.5" />
            {positive ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
    </Card>
  );
}
