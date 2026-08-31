import { cn } from "@/frontend/ui/cn";

export function Logo({
  className,
  compact = false,
  tagline,
  size = "md",
}: {
  className?: string;
  compact?: boolean;
  tagline?: string;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? 52 : size === "sm" ? 28 : 40;

  return (
    <div className={cn("flex min-w-0 items-center", size === "sm" ? "gap-2" : "gap-3", className)}>
      <img
        src="/brand/mark.png"
        alt="Smart Profits"
        width={px}
        height={px}
        className="shrink-0 bg-transparent object-contain"
        style={{ width: px, height: px }}
      />
      {!compact && (
        <div className="min-w-0">
          <p className={cn("font-bold tracking-tight break-words text-foreground", size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg")}>
            Smart Profits
          </p>
          <p className={cn("text-primary break-words", size === "lg" ? "mt-0.5 text-xs leading-4" : "text-[11px] leading-4")}>
            {tagline ?? "من ملف فوضوي إلى قرار ذكي"}
          </p>
        </div>
      )}
    </div>
  );
}
