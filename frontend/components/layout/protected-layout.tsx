"use client";

import { AppSidebar } from "@/frontend/components/layout/app-sidebar";
import { AuthGuard } from "@/frontend/components/layout/auth-guard";
import { ClassificationClarifier } from "@/frontend/components/analysis/classification-clarifier";

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
        <AppSidebar />
        <div className="min-w-0 flex-1 overflow-x-clip">
          <ClassificationClarifier />
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
