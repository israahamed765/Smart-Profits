"use client";

import { AdminGuard } from "@/frontend/components/admin/admin-guard";
import { AdminSidebar } from "@/frontend/components/admin/admin-sidebar";
import { AdminPortalProvider } from "@/frontend/context/admin-portal";

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminPortalProvider>
        <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
          <AdminSidebar />
          <div className="min-w-0 flex-1 overflow-x-clip">{children}</div>
        </div>
      </AdminPortalProvider>
    </AdminGuard>
  );
}
