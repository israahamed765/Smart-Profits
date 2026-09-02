"use client";

import { Lock, Mail, Phone, Store, User, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthShell } from "@/frontend/components/auth/auth-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useAuth } from "@/frontend/context/auth-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useSmartGuard } from "@/frontend/context/smart-guard-context";
import { GuardBlockedError, SMART_GUARD_REGISTER_CONTINUE } from "@/frontend/lib/smart-guard/client";
import {
  isRegisterError,
  isRegisterValidationErrors,
  registerErrorMessage,
  validateRegisterForm,
  type RegisterError,
} from "@/frontend/lib/register-errors";
import { normalizeMobile } from "@/frontend/lib/phone";
import { toast } from "sonner";

type PendingRegister = {
  fullName: string;
  storeName: string;
  email: string;
  phone: string;
  password: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { surfaceVerdict } = useSmartGuard();
  const { t } = useAppearance();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pendingRegisterRef = useRef<PendingRegister | null>(null);

  const showRegisterErrors = useCallback(
    (errors: RegisterError[]) => {
      const seen = new Set<string>();
      for (const error of errors) {
        if (seen.has(error.code)) continue;
        seen.add(error.code);
        toast.error(registerErrorMessage(t, error));
      }
    },
    [t],
  );

  const completeRegister = useCallback(
    (payload: PendingRegister) => {
      setSubmitting(true);
      return register(payload)
        .then(() => {
          pendingRegisterRef.current = null;
          toast.success(t("auth.registered"));
          router.push("/dashboard");
        })
        .catch((error: unknown) => {
          if (error instanceof GuardBlockedError) {
            pendingRegisterRef.current = payload;
            surfaceVerdict(error.verdict, { email: payload.email, phone: payload.phone });
            return;
          }
          if (isRegisterValidationErrors(error)) {
            if (error.errors.some((item) => item.code === "emailTaken" || item.code === "phoneTaken")) {
              pendingRegisterRef.current = null;
            }
            showRegisterErrors(error.errors);
            return;
          }
          if (isRegisterError(error)) {
            if (error.code === "emailTaken" || error.code === "phoneTaken") {
              pendingRegisterRef.current = null;
            }
            toast.error(registerErrorMessage(t, error));
            return;
          }
          toast.error(t("auth.register.error.server"));
        })
        .finally(() => setSubmitting(false));
    },
    [register, router, showRegisterErrors, surfaceVerdict, t],
  );

  useEffect(() => {
    function onStepUpDone() {
      const pending = pendingRegisterRef.current;
      if (!pending || submitting) return;
      void completeRegister(pending);
    }
    window.addEventListener(SMART_GUARD_REGISTER_CONTINUE, onStepUpDone);
    return () => window.removeEventListener(SMART_GUARD_REGISTER_CONTINUE, onStepUpDone);
  }, [completeRegister, submitting]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const data = new FormData(e.currentTarget);
    const fullName = String(data.get("fullName") || "").trim();
    const storeName = String(data.get("storeName") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phoneRaw = String(data.get("phone") || "");
    const phone = normalizeMobile(phoneRaw);
    const password = String(data.get("password") || "");

    const validationErrors = validateRegisterForm({
      fullName,
      storeName,
      email,
      phoneRaw,
      password,
      accepted,
    });
    if (validationErrors.length > 0) {
      showRegisterErrors(validationErrors);
      return;
    }

    const payload: PendingRegister = {
      fullName,
      storeName,
      email,
      phone: phone!,
      password,
    };
    pendingRegisterRef.current = payload;
    void completeRegister(payload);
  }

  return (
    <AuthShell compact>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t("auth.register.title")}</h1>
      <p className="mt-1.5 text-sm text-muted">{t("auth.register.subtitle")}</p>

      <form className="mt-5 space-y-3.5" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fullName">{t("auth.fullName")}</Label>
          <div className="relative">
            <User className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input id="fullName" name="fullName" placeholder={t("auth.placeholder.name")} className="pe-10" />
          </div>
        </div>
        <div>
          <Label htmlFor="storeName">{t("auth.storeName")}</Label>
          <div className="relative">
            <Store className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input id="storeName" name="storeName" placeholder={t("auth.placeholder.store")} className="pe-10" />
          </div>
        </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="email">{t("auth.email")}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input id="email" name="email" type="email" placeholder="example@gmail.com" className="pe-10" />
          </div>
        </div>
        <div>
          <Label htmlFor="phone">{t("auth.phone")}</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              title={t("auth.phone.hint")}
              placeholder={t("auth.placeholder.phone")}
              className="pe-10 text-start"
            />
          </div>
        </div>
        </div>
        <div>
          <Label htmlFor="password">{t("auth.password")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input id="password" name="password" type="password" placeholder="••••••••" className="pe-10" />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="mt-0.5 accent-accent"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            {t("auth.accept")} <span className="text-accent">{t("auth.terms")}</span> {t("auth.and")}{" "}
            <span className="text-accent">{t("auth.privacy")}</span>
          </span>
        </label>

        <Button type="submit" variant="accent" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("auth.loading") : t("auth.create")}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {t("auth.hasAccount")}{" "}
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.login.title")}
        </Link>
        <span className="mx-2">·</span>
        <Link href="/forgot-password" className="text-accent hover:underline">
          {t("auth.forgot")}
        </Link>
      </p>
    </AuthShell>
  );
}
