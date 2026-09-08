"use client";

import { useEffect, useState } from "react";
import { Globe, LayoutDashboard, LogOut, Menu, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/frontend/components/brand/logo";
import { AppearanceToggles } from "@/frontend/components/layout/appearance-toggles";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { useAdminAuth } from "@/frontend/context/admin-auth";
import { useAdminPortal } from "@/frontend/context/admin-portal";
import { useAppearance } from "@/frontend/context/appearance";
import type { DateRangeKey } from "@/lib/admin/config";
import { cn } from "@/frontend/ui/cn";

const NAV = [
  { href: "/admin", key: "admin.nav.overview" as const, icon: LayoutDashboard },
  { href: "/admin/financials", key: "admin.nav.financials" as const, icon: Wallet },
  { href: "/admin/users", key: "admin.nav.users" as const, icon: Users },
  { href: "/admin/traffic", key: "admin.nav.traffic" as const, icon: Globe },
];

const RANGES: DateRangeKey[] = ["today", "week", "month", "year", "custom"];

function SidebarPanel({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, admin } = useAdminAuth();
  const { range, from, to, setRange, setCustomRange } = useAdminPortal();
  const { t } = useAppearance();

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <Logo size="sm" tagline={t("admin.tagline")} />
      <p className="mt-3 text-[11px] leading-5 text-muted">{t("admin.watch")}</p>
      <div className="mt-4">
        <AppearanceToggles />
      </div>

      <nav className="mt-6 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-primary/15 text-foreground shadow-[inset_3px_0_0_var(--primary)] rtl:shadow-[inset_-3px_0_0_var(--primary)]"
                  : "text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 rounded-2xl border border-border bg-black/[0.03] p-3 dark:bg-white/3">
        <p className="mb-2 text-xs font-medium text-foreground">{t("admin.range")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {RANGES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={cn(
                "rounded-lg px-2 py-1.5 text-[11px] transition",
                range === key ? "bg-accent text-slate-950" : "bg-black/5 text-muted hover:text-foreground dark:bg-white/5",
              )}
            >
              {t(`admin.${key}`)}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="mt-3 space-y-2">
            <Input type="date" value={from} onChange={(event) => setCustomRange(event.target.value, to)} className="h-9 text-xs" />
            <Input type="date" value={to} onChange={(event) => setCustomRange(from, event.target.value)} className="h-9 text-xs" />
          </div>
        )}
      </div>

      <div className="mt-auto pt-6">
        <p className="mb-2 truncate px-1 text-xs text-muted">{admin?.name || t("admin.role")}</p>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted"
          onClick={() => {
            onNavigate?.();
            logout();
            router.push("/admin/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          {t("admin.logout")}
        </Button>
      </div>
    </div>
  );
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useAppearance();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-3 lg:hidden">
        <Logo size="sm" tagline={t("admin.tagline")} />
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          aria-label={t("admin.menu")}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("admin.menu")}>
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={t("admin.menuClose")}
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-[min(20rem,88vw)] flex-col border-e border-border bg-card px-4 py-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{t("admin.menu")}</p>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground"
                aria-label={t("admin.menuClose")}
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarPanel onNavigate={() => setOpen(false)} className="min-h-0 flex-1 overflow-y-auto pb-2" />
          </aside>
        </div>
      )}

      <aside className="sticky top-0 z-30 hidden h-dvh w-[300px] shrink-0 flex-col overflow-y-auto border-e border-border bg-card px-4 py-5 lg:flex">
        <SidebarPanel />
      </aside>
    </>
  );
}
