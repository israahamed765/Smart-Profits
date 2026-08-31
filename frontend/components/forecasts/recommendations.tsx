"use client";

import { Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useSmartGuard } from "@/frontend/context/smart-guard-context";
import { localizeRecommendation } from "@/frontend/lib/localize-advisor";
import { cn } from "@/frontend/ui/cn";
import { GuardBlockedError } from "@/frontend/lib/smart-guard/client";
import { toast } from "sonner";

export function Recommendations() {
  const { result, applyRecommendation, actionLog, activeFileId } = useAnalysis();
  const { t } = useAppearance();
  const { protect } = useSmartGuard();
  const router = useRouter();
  if (!result) return null;
  const margin = result.kpis.profitMargin;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-primary" />
          {t("sim.ai")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.forecast.recommendations.map((rec) => {
          const alreadyLogged = actionLog.some(
            (entry) => entry.fileId === activeFileId && entry.recommendationId === rec.id,
          );
          const copy = localizeRecommendation(rec.id, margin, t);
          return (
            <div
              key={rec.id}
              className={cn(
                "rounded-xl border p-4",
                rec.tone === "positive" ? "border-accent/30 bg-accent/8" : "border-red-500/20 bg-red-500/8",
              )}
            >
              <h4 className={cn("text-sm font-semibold", rec.tone === "positive" ? "text-accent" : "text-red-300")}>
                {copy.title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-300">{copy.body}</p>
              <Button
                size="sm"
                variant={alreadyLogged ? "outline" : rec.tone === "positive" ? "accent" : "default"}
                className="mt-3"
                onClick={() => {
                  void (async () => {
                    try {
                      await protect("price_change");
                      applyRecommendation(rec);
                      toast.success(alreadyLogged ? t("sim.logged") : t("sim.saved"));
                      router.push("/settings?tab=actions");
                    } catch (error) {
                      if (error instanceof GuardBlockedError) return;
                    }
                  })();
                }}
              >
                {alreadyLogged ? t("sim.viewLog") : copy.actionLabel}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
