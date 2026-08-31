"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppearance } from "@/frontend/context/appearance";
import { useAuth } from "@/frontend/context/auth-context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { t } = useAppearance();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted">
        {t("auth.loading")}
      </div>
    );
  }

  return <>{children}</>;
}
