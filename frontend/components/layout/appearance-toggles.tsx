"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { useAppearance } from "@/frontend/context/appearance";
import { cn } from "@/frontend/ui/cn";

export function AppearanceToggles({ className }: { className?: string }) {
  const { theme, setTheme, locale, setLocale, t } = useAppearance();

  return (
    <div className={cn("flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto", className)}>
      <div className="flex items-center rounded-xl border border-border bg-card p-1 text-xs">
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition",
            theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
          )}
          aria-label={t("header.theme.dark")}
        >
          <Moon className="h-3.5 w-3.5" />
          {t("header.theme.dark")}
        </button>
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition",
            theme === "light" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
          )}
          aria-label={t("header.theme.light")}
        >
          <Sun className="h-3.5 w-3.5" />
          {t("header.theme.light")}
        </button>
      </div>
      <div className="flex items-center rounded-xl border border-border bg-card p-1 text-xs">
        <button
          type="button"
          onClick={() => setLocale("ar")}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition",
            locale === "ar" ? "bg-accent text-slate-950" : "text-muted hover:text-foreground",
          )}
        >
          <Languages className="h-3.5 w-3.5" />
          ع
        </button>
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={cn(
            "rounded-lg px-2.5 py-1.5 transition",
            locale === "en" ? "bg-accent text-slate-950" : "text-muted hover:text-foreground",
          )}
        >
          EN
        </button>
      </div>
    </div>
  );
}
