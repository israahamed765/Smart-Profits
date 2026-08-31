"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/frontend/lib/api/client";

export interface AdminSession {
  email: string;
  name: string;
}

interface AdminAuthValue {
  admin: AdminSession | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/admin/me")
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { admin?: AdminSession };
        return data.admin ?? null;
      })
      .then((next) => {
        if (!cancelled) setAdmin(next);
      })
      .catch(() => {
        if (!cancelled) setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiFetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { admin: AdminSession };
    setAdmin(data.admin);
    return true;
  }, []);

  const logout = useCallback(() => {
    setAdmin(null);
    void apiFetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ admin, ready, login, logout }), [admin, ready, login, logout]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
