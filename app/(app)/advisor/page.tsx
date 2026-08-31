"use client";

import { AdvisorAskBox } from "@/frontend/components/advisor/ask-box";
import { AdvisorHelpCards } from "@/frontend/components/advisor/help-cards";
import { AppHeader } from "@/frontend/components/layout/app-header";
import { useAppearance } from "@/frontend/context/appearance";

export default function AdvisorPage() {
  const { t } = useAppearance();
  return (
    <>
      <AppHeader title={t("advisor.title")} subtitle={t("advisor.subtitle")} />
      <div className="grid gap-4 p-3 sm:gap-5 sm:p-4 lg:grid-cols-12 lg:p-6">
        <div className="min-w-0 lg:col-span-8">
          <AdvisorAskBox chat />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <AdvisorHelpCards />
        </div>
      </div>
    </>
  );
}
