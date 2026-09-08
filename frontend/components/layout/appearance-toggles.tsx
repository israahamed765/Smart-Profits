"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { useAppearance } from "@/frontend/context/appearance";
import { cn } from "@/frontend/ui/cn";

export function AppearanceToggles({ className }: { className?: string }) {
  const { theme, setTheme, locale, setLocale, t } = useAppearance();

  return (
    <div className={cn("grid w-full min-w-0 grid-cols-2 gap-1.5", className)}>
      <div className="flex min-w-0 items-center rounded-xl border border-border bg-card p-0.5 text-[11px]">
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 transition",
            theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
          )}
          aria-label={t("header.theme.dark")}
          title={t("header.theme.dark")}
        >
          <Moon className="h-3 w-3 shrink-0" />
          <span className="truncate">{t("header.theme.dark")}</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 transition",
            theme === "light" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
          )}
          aria-label={t("header.theme.light")}
          title={t("header.theme.light")}
        >
          <Sun className="h-3 w-3 shrink-0" />
          <span className="truncate">{t("header.theme.light")}</span>
        </button>
      </div>
      <div className="flex min-w-0 items-center rounded-xl border border-border bg-card p-0.5 text-[11px]">
        <button
          type="button"
          onClick={() => setLocale("ar")}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 transition",
            locale === "ar" ? "bg-accent text-slate-950" : "text-muted hover:text-foreground",
          )}
          aria-label="العربية"
          title="العربية"
        >
          <Languages className="h-3 w-3 shrink-0" />
          <span>ع</span>
        </button>
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center rounded-lg px-1.5 py-1.5 transition",
            locale === "en" ? "bg-accent text-slate-950" : "text-muted hover:text-foreground",
          )}
          aria-label="English"
          title="English"
        >
          EN
        </button>
      </div>
    </div>
  );
}
