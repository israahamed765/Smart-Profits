"use client";

import {
  Bot,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/frontend/components/brand/logo";
import { FileArchiveList } from "@/frontend/components/layout/file-archive";
import { AppearanceToggles } from "@/frontend/components/layout/appearance-toggles";
import { Button } from "@/frontend/components/ui/button";
import { useAuth } from "@/frontend/context/auth-context";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { cn } from "@/frontend/ui/cn";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { actionLog } = useAnalysis();
  const { t } = useAppearance();

  const nav = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/simulator", label: t("nav.simulator"), icon: SlidersHorizontal },
    { href: "/advisor", label: t("nav.advisor"), icon: Bot },
    { href: "/data", label: t("nav.data"), icon: FolderOpen },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <aside className="sticky top-0 z-40 flex w-full shrink-0 flex-col border-b border-border bg-card px-3 py-2 lg:h-dvh lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-e lg:py-4">
      <Logo size="sm" tagline={t("brand.tagline")} className="min-w-0" />
      <div className="mt-2 overflow-x-auto lg:mt-4">
        <AppearanceToggles />
      </div>

      <Button className="mt-3 w-full lg:mt-6" onClick={() => router.push("/data?new=1")}>
        <Plus className="h-4 w-4" />
        {t("nav.newAnalysis")}
      </Button>

      <nav className="mt-2 flex flex-row gap-1 overflow-x-auto pb-1 lg:mt-6 lg:flex-col lg:overflow-visible lg:pb-0">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm leading-5 whitespace-nowrap transition lg:shrink lg:whitespace-normal",
                active
                  ? "bg-primary/15 text-foreground shadow-[inset_3px_0_0_var(--primary)] rtl:shadow-[inset_-3px_0_0_var(--primary)]"
                  : "text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/settings" && actionLog.length > 0 && (
                <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                  {actionLog.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 hidden min-h-0 flex-1 overflow-hidden lg:block">
        <FileArchiveList compact />
      </div>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}
