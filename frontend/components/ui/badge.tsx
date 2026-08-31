import { cn } from "@/frontend/ui/cn";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "success" | "danger" | "info" | "warning";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-white/5 text-slate-300",
    success: "bg-teal-500/15 text-primary",
    danger: "bg-red-500/15 text-red-400",
    info: "bg-cyan-500/15 text-cyan-300",
    warning: "bg-amber-500/15 text-accent",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
