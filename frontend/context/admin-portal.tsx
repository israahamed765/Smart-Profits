"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DateRangeKey } from "@/lib/admin/config";
import {
  buildAdminSnapshot,
  buildAdminSnapshotFromFacts,
  collectClientFacts,
  mergeFacts,
  saveUserOverride,
  type AdminFacts,
} from "@/frontend/lib/admin/metrics";
import type { AdminSnapshot, AdminUserRow } from "@/lib/admin/types";
import { apiFetch } from "@/frontend/lib/api/client";

interface AdminPortalValue {
  range: DateRangeKey;
  from: string;
  to: string;
  snapshot: AdminSnapshot | null;
  ready: boolean;
  setRange: (key: DateRangeKey) => void;
  setCustomRange: (from: string, to: string) => void;
  refresh: () => void;
  patchUser: (id: string, patch: Partial<AdminUserRow>) => void;
}

const AdminPortalContext = createContext<AdminPortalValue | null>(null);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function AdminPortalProvider({ children }: { children: React.ReactNode }) {
  const [range, setRangeState] = useState<DateRangeKey>("month");
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [tick, setTick] = useState(0);
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const local = collectClientFacts();
      try {
        const params = new URLSearchParams({ range, from, to });
        const response = await apiFetch(`/api/admin/snapshot?${params.toString()}`);
        if (response.ok) {
          const serverFacts = (await response.json()) as AdminFacts;
          const merged = buildAdminSnapshotFromFacts(mergeFacts(local, serverFacts), range, from, to);
          if (!cancelled) {
            setSnapshot(merged);
            setReady(true);
          }
          return;
        }
      } catch {
        // fall through to local
      }
      if (!cancelled) {
        setSnapshot(buildAdminSnapshot(range, from, to));
        setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [range, from, to, tick]);

  const setRange = useCallback((key: DateRangeKey) => {
    setRangeState(key);
  }, []);

  const setCustomRange = useCallback((nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setRangeState("custom");
  }, []);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const patchUser = useCallback((id: string, patch: Partial<AdminUserRow>) => {
    saveUserOverride(id, patch);
    const email = id.replace(/^real-/, "");
    void apiFetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, plan: patch.plan, status: patch.status }),
    }).catch(() => undefined);
    setTick((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ range, from, to, snapshot, ready, setRange, setCustomRange, refresh, patchUser }),
    [range, from, to, snapshot, ready, setRange, setCustomRange, refresh, patchUser],
  );

  return <AdminPortalContext.Provider value={value}>{children}</AdminPortalContext.Provider>;
}

export function useAdminPortal() {
  const ctx = useContext(AdminPortalContext);
  if (!ctx) throw new Error("useAdminPortal must be used within AdminPortalProvider");
  return ctx;
}
