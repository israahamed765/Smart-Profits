"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { confirmGuardStepUp, evaluateGuard, GuardBlockedError, sendStepUpCode } from "@/frontend/lib/smart-guard/client";
import { useAuth } from "@/frontend/context/auth-context";
import type { GuardVerdict, SensitiveAction } from "@/lib/smart-guard/types";

interface SmartGuardValue {
  lastVerdict: GuardVerdict | null;
  pending: boolean;
  frozen: boolean;
  protect: (action: SensitiveAction, extra?: { email?: string; phone?: string; file?: File }) => Promise<GuardVerdict>;
  surfaceVerdict: (verdict: GuardVerdict, extra?: { email?: string; phone?: string }) => void;
  requestStepUpCode: () => Promise<{
    maskedPhone: string;
    retryAfterSec: number;
    demoCode?: string;
    error?: string;
  }>;
  confirmStepUp: (code: string) => Promise<GuardVerdict>;
  dismiss: () => void;
}

const SmartGuardContext = createContext<SmartGuardValue | null>(null);

export function SmartGuardProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lastVerdict, setLastVerdict] = useState<GuardVerdict | null>(null);
  const [pending, setPending] = useState(false);
  const identityRef = useRef<{ email?: string; phone?: string }>({});

  useEffect(() => {
    if (!user) setLastVerdict(null);
  }, [user]);

  useEffect(() => {
    function onVerdict(event: Event) {
      const detail = (event as CustomEvent<GuardVerdict>).detail;
      if (detail) setLastVerdict(detail);
    }
    window.addEventListener("smart-guard-verdict", onVerdict);
    return () => window.removeEventListener("smart-guard-verdict", onVerdict);
  }, []);

  const surfaceVerdict = useCallback((verdict: GuardVerdict, extra?: { email?: string; phone?: string }) => {
    identityRef.current = { email: extra?.email, phone: extra?.phone };
    setLastVerdict(verdict);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("smart-guard-verdict", { detail: verdict }));
    }
  }, []);

  const protect = useCallback(async (action: SensitiveAction, extra?: { email?: string; phone?: string; file?: File }) => {
    const identity = { email: extra?.email, phone: extra?.phone };
    identityRef.current = identity;
    setPending(true);
    try {
      const verdict = await evaluateGuard({
        action,
        email: extra?.email,
        phone: extra?.phone,
        fileBytes: extra?.file?.size,
        fileName: extra?.file?.name,
      });
      setLastVerdict(verdict);
      if (verdict.decision !== "allow") {
        throw new GuardBlockedError(verdict);
      }
      return verdict;
    } finally {
      setPending(false);
    }
  }, []);

  const requestStepUpCode = useCallback(async () => {
    setPending(true);
    try {
      return await sendStepUpCode(identityRef.current.email, identityRef.current.phone, lastVerdict?.action);
    } finally {
      setPending(false);
    }
  }, [lastVerdict?.action]);

  const confirmStepUp = useCallback(async (code: string) => {
    if (!lastVerdict) throw new Error("No pending Smart Guard action.");
    setPending(true);
    try {
      const verdict = await confirmGuardStepUp(
        lastVerdict.action,
        code,
        identityRef.current.email,
        identityRef.current.phone,
      );
      setLastVerdict(verdict);
      if (verdict.decision !== "allow") {
        throw new GuardBlockedError(verdict);
      }
      return verdict;
    } finally {
      setPending(false);
    }
  }, [lastVerdict]);

  const dismiss = useCallback(() => {
    setLastVerdict((prev) => (prev?.decision === "step_up" ? null : prev));
  }, []);

  const value = useMemo<SmartGuardValue>(
    () => ({
      lastVerdict,
      pending,
      frozen: lastVerdict?.decision === "freeze",
      protect,
      surfaceVerdict,
      requestStepUpCode,
      confirmStepUp,
      dismiss,
    }),
    [lastVerdict, pending, protect, surfaceVerdict, requestStepUpCode, confirmStepUp, dismiss],
  );

  return <SmartGuardContext.Provider value={value}>{children}</SmartGuardContext.Provider>;
}

export function useSmartGuard() {
  const ctx = useContext(SmartGuardContext);
  if (!ctx) throw new Error("useSmartGuard must be used within SmartGuardProvider");
  return ctx;
}

export function useSmartGuardOptional() {
  return useContext(SmartGuardContext);
}
