"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { AuthBrandPanel } from "@/frontend/components/auth/auth-shell";
import { Logo } from "@/frontend/components/brand/logo";
import { AppearanceToggles } from "@/frontend/components/layout/appearance-toggles";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useAdminAuth } from "@/frontend/context/admin-auth";
import { useAppearance } from "@/frontend/context/appearance";
import { ADMIN_LOGIN_HINT_EMAIL } from "@/lib/admin/config";

export default function AdminLoginPage() {
  const router = useRouter();
  const { admin, ready, login } = useAdminAuth();
  const { t } = useAppearance();

  useEffect(() => {
    if (ready && admin) router.replace("/admin");
  }, [admin, ready, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (!(await login(email, password))) {
      toast.error(t("admin.badLogin"));
      return;
    }
    toast.success(t("admin.welcome"));
    router.push("/admin");
  }

  return (
    <div className="flex min-h-dvh bg-background lg:h-dvh lg:overflow-hidden">
      <section className="flex min-h-dvh w-full flex-col justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10 lg:h-dvh lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex flex-col gap-4">
            <Logo size="lg" tagline={t("admin.tagline.login")} />
            <AppearanceToggles />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">{t("admin.login.title")}</h1>
          <p className="mt-2 text-sm leading-7 text-muted">{t("admin.login.subtitle")}</p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="email">{t("admin.login.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={ADMIN_LOGIN_HINT_EMAIL}
                placeholder={ADMIN_LOGIN_HINT_EMAIL}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">{t("admin.login.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" variant="accent" size="lg" className="w-full">
              {t("admin.login.submit")}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {t("admin.login.merchant")}{" "}
            <Link href="/login" className="text-accent hover:underline">
              {t("admin.login.merchantLink")}
            </Link>
          </p>
        </div>
      </section>

      <AuthBrandPanel title={t("admin.brain")} body={t("admin.brain.body")} tagline={t("admin.tagline.login")} />
    </div>
  );
}
