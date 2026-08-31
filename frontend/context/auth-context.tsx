"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { trackPlatform } from "@/frontend/lib/admin/track";
import { apiFetch } from "@/frontend/lib/api/client";
import { normalizeMobile } from "@/frontend/lib/phone";
import { GuardBlockedError, verdictFromPayload } from "@/frontend/lib/smart-guard/client";
import type { GuardVerdict } from "@/lib/smart-guard/types";

export interface AuthUser {
  fullName: string;
  storeName: string;
  email: string;
  phone: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  register: (user: AuthUser & { password: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; status?: number; verdict?: GuardVerdict }>;
  updateProfile: (patch: Partial<Pick<AuthUser, "fullName" | "storeName" | "phone">>) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readErrorPayload(response: Response) {
  try {
    return (await response.json()) as { error?: string; verdict?: GuardVerdict };
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { user?: AuthUser };
        return data.user ?? null;
      })
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (next: AuthUser & { password: string }) => {
    const phone = normalizeMobile(next.phone || "") || "";
    const response = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: next.fullName,
        storeName: next.storeName,
        email: next.email,
        phone,
        password: next.password,
      }),
    });
    if (!response.ok) {
      const payload = await readErrorPayload(response);
      const verdict = verdictFromPayload(payload);
      if (verdict) throw new GuardBlockedError(verdict);
      const message = payload.error || "";
      if (response.status === 409 && message.includes("الجوال")) throw new Error("phone-taken");
      throw new Error(message || "register-failed");
    }
    const data = (await response.json()) as { user: AuthUser };
    setUser(data.user);
    trackPlatform("register", data.user.storeName, data.user.email);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    let response: Response;
    try {
      response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return { ok: false, status: 0, error: "unavailable" };
    }
    if (!response.ok) {
      const payload = await readErrorPayload(response);
      const verdict = verdictFromPayload(payload);
      return { ok: false, status: response.status, error: payload.error || "", verdict: verdict ?? undefined };
    }
    const data = (await response.json()) as { user: AuthUser };
    setUser(data.user);
    trackPlatform("login", data.user.storeName, data.user.email);
    return { ok: true };
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Pick<AuthUser, "fullName" | "storeName" | "phone">>) => {
      if (!user) return false;
      const response = await apiFetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { account: AuthUser };
      setUser({
        fullName: data.account.fullName,
        storeName: data.account.storeName,
        email: data.account.email,
        phone: data.account.phone,
      });
      return true;
    },
    [user],
  );

  const logout = useCallback(() => {
    setUser(null);
    void apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ user, ready, register, login, updateProfile, logout }),
    [user, ready, register, login, updateProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
