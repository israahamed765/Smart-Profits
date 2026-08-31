"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Card } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";

export function AiInsightBox() {
  const { result } = useAnalysis();
  if (!result) return null;
  const insight =
    result.forecast.alerts.find((a) => a.id === "shipping-spike") ??
    result.forecast.alerts.find((a) => a.severity !== "positive") ??
    result.forecast.alerts[0];

  if (!insight) return null;

  return (
    <Card className="border-primary/40 bg-primary/5 p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-300">
        <Sparkles className="h-4 w-4" />
        محلل النظام الاصطناعي
      </div>
      <p className="text-sm leading-7 text-slate-200">{insight.message}</p>
      <Link href="/simulator" className="mt-3 inline-block text-sm text-primary hover:underline">
        عرض التفاصيل والتوصيات
      </Link>
    </Card>
  );
}
