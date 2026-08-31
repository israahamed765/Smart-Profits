"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppearance } from "@/frontend/context/appearance";
import { useAdminAuth } from "@/frontend/context/admin-auth";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { admin, ready } = useAdminAuth();
  const { t } = useAppearance();

  useEffect(() => {
    if (ready && !admin) router.replace("/admin/login");
  }, [admin, ready, router]);

  if (!ready || !admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">
        {t("admin.checking")}
      </div>
    );
  }

  return <>{children}</>;
}
