"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/frontend/components/auth/auth-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useAppearance } from "@/frontend/context/appearance";
import { useSmartGuard } from "@/frontend/context/smart-guard-context";
import { GuardBlockedError, verdictFromPayload } from "@/frontend/lib/smart-guard/client";
import { apiFetch } from "@/frontend/lib/api/client";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const { protect, surfaceVerdict } = useSmartGuard();
  const { t } = useAppearance();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [found, setFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function onLookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !value.includes("@")) {
      toast.error(t("auth.forgot.needEmail"));
      return;
    }

    setSending(true);
    try {
      const response = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        demoCode?: string;
      };
      if (!response.ok) {
        setFound(false);
        toast.error(payload.error || t("auth.forgot.sendFail"));
        return;
      }
      setFound(true);
      if (payload.demoCode) setCode(payload.demoCode);
      toast.success(payload.message || t("auth.forgot.sent"));
    } catch {
      toast.error(t("auth.forgot.mailFail"));
    } finally {
      setSending(false);
    }
  }

  async function onReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t("auth.forgot.reenter"));
      return;
    }
    if (code.trim().length < 4) {
      toast.error(t("auth.forgot.needCode"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("auth.forgot.short"));
      return;
    }
    try {
      await protect("password_reset", { email: email.trim().toLowerCase() });
    } catch (error) {
      if (error instanceof GuardBlockedError) return;
      toast.error(error instanceof Error ? error.message : t("auth.forgot.sendFail"));
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          password: newPassword,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const verdict = verdictFromPayload(payload);
        if (verdict) {
          surfaceVerdict(verdict, { email: email.trim().toLowerCase() });
          return;
        }
        toast.error((payload as { error?: string }).error || t("auth.forgot.sendFail"));
        return;
      }
      toast.success(t("auth.forgot.saved"));
      router.push("/dashboard");
    } catch {
      toast.error(t("auth.forgot.sendFail"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="mt-6 text-2xl font-bold text-foreground sm:mt-10 sm:text-3xl">{t("auth.forgot.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("auth.forgot.subtitle")}</p>

      <form className="mt-8 space-y-4" onSubmit={onLookup}>
        <div>
          <Label htmlFor="email">{t("auth.email")}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-muted" />
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFound(false);
              }}
              placeholder="example@gmail.com"
              className="pe-10"
              required
            />
          </div>
        </div>
        <Button type="submit" variant="accent" size="lg" className="w-full" disabled={sending}>
          {sending ? t("auth.forgot.sending") : t("auth.forgot.send")}
        </Button>
      </form>

      {found && (
        <form className="mt-8 space-y-4 rounded-2xl border border-border p-4" onSubmit={onReset}>
          <p className="text-sm text-muted">{t("auth.forgot.found")}</p>
          <div>
            <Label htmlFor="code">{t("auth.forgot.code")}</Label>
            <Input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              required
            />
          </div>
          <div>
            <Label htmlFor="newPassword">{t("auth.forgot.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {t("auth.forgot.save")}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.forgot.remember")}{" "}
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.login.title")}
        </Link>
      </p>
    </AuthShell>
  );
}
