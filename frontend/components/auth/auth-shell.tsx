"use client";

import { Logo } from "@/frontend/components/brand/logo";
import { AppearanceToggles } from "@/frontend/components/layout/appearance-toggles";
import { useAppearance } from "@/frontend/context/appearance";

export function AuthBrandPanel({
  compact = false,
  title,
  body,
  tagline,
}: {
  compact?: boolean;
  title?: string;
  body?: string;
  tagline?: string;
}) {
  const { t } = useAppearance();
  return (
    <div className="auth-brand-panel relative hidden h-dvh overflow-hidden bg-card lg:flex lg:w-1/2 lg:items-center lg:justify-center">
      <div className="auth-brand-grid bg-grid-fade absolute inset-0 opacity-40" />
      <div className="auth-brand-veil absolute inset-0 bg-gradient-to-t from-background via-transparent to-primary/10" />
      <div className="auth-brand-glow-a absolute start-16 top-24 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
      <div className="auth-brand-glow-b absolute end-10 bottom-20 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />

      <div
        className={`auth-brand-card relative z-10 mx-4 max-w-md rounded-3xl border border-primary/45 bg-card shadow-2xl backdrop-blur-md sm:mx-10 ${
          compact ? "p-6" : "p-8"
        }`}
      >
        <Logo size={compact ? "md" : "lg"} tagline={tagline ?? t("brand.tagline")} />
        <h2 className={`font-bold leading-10 text-foreground ${compact ? "mt-4 text-xl" : "mt-6 text-2xl"}`}>
          {title ?? t("brand.advisor")}
        </h2>
        <p className={`text-sm leading-7 text-muted ${compact ? "mt-2" : "mt-3"}`}>{body ?? t("brand.advisor.body")}</p>
      </div>
    </div>
  );
}

export function AuthShell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  const { t } = useAppearance();
  return (
    <div className="flex min-h-dvh bg-background lg:h-dvh lg:overflow-hidden">
      <section
        className={`flex min-h-dvh w-full flex-col justify-center lg:h-dvh lg:w-1/2 ${
          compact ? "overflow-y-auto px-4 py-5 sm:px-6 lg:overflow-hidden lg:px-12" : "overflow-y-auto px-4 py-6 sm:px-6 lg:px-16"
        }`}
      >
        <div className={`mx-auto w-full ${compact ? "max-w-lg" : "max-w-md"}`}>
          <div className={`flex flex-col ${compact ? "mb-5 gap-3" : "mb-6 gap-4"}`}>
            <Logo size={compact ? "md" : "lg"} tagline={t("brand.tagline")} />
            <AppearanceToggles />
          </div>
          {children}
        </div>
      </section>
      <AuthBrandPanel />
    </div>
  );
}
