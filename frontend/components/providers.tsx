"use client";

import { Toaster } from "sonner";
import { AdminAuthProvider } from "@/frontend/context/admin-auth";
import { AnalysisProvider } from "@/frontend/context/analysis-context";
import { AppearanceProvider, useAppearance } from "@/frontend/context/appearance";
import { AuthProvider } from "@/frontend/context/auth-context";
import { SmartGuardProvider } from "@/frontend/context/smart-guard-context";
import { SmartGuardOverlay } from "@/frontend/components/guard/smart-guard-overlay";

function ThemedToaster() {
  const { theme, dir } = useAppearance();
  return <Toaster theme={theme} position="top-center" richColors dir={dir} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppearanceProvider>
      <AuthProvider>
        <AdminAuthProvider>
          <SmartGuardProvider>
            <AnalysisProvider>
              {children}
              <SmartGuardOverlay />
              <ThemedToaster />
            </AnalysisProvider>
          </SmartGuardProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </AppearanceProvider>
  );
}
