"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { formatDateAr } from "@/frontend/lib/format";

export function ActionLogList() {
  const { actionLog, files, selectFile, activeFileId } = useAnalysis();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <Card className="border-accent/30 bg-accent/8 p-5">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-6 w-6 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">سجل «تطبيق التعديل»</h2>
            <p className="mt-1 text-sm leading-7 text-slate-300">
              التوصيات التي تضغط عليها من المحاكي والتوقعات تُحفظ هنا مرتبطة بالملف المفتوح وقتها.
            </p>
          </div>
        </div>
      </Card>

      {actionLog.length === 0 ? (
        <Card className="p-5 text-center sm:p-8">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-slate-500" />
          <p className="text-foreground">لا توجد إجراءات مسجّلة بعد.</p>
          <p className="mt-2 text-sm text-muted">افتح المحاكي والتوقعات واضغط تطبيق التعديل على توصية.</p>
          <Link href="/simulator">
            <Button className="mt-4">الذهاب للمحاكاة</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {actionLog.map((entry) => {
            const stillExists = files.some((file) => file.id === entry.fileId);
            return (
              <Card key={entry.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{entry.title}</h3>
                      <Badge tone={entry.status === "applied" ? "success" : "info"}>
                        {entry.status === "applied" ? "تم التطبيق" : "تمت المراجعة"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{entry.body}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {entry.fileName}
                      <span>•</span>
                      {formatDateAr(new Date(entry.appliedAt))}
                      <span>•</span>
                      {entry.actionLabel}
                    </p>
                  </div>
                  {stillExists && (
                    <Button
                      size="sm"
                      variant={entry.fileId === activeFileId ? "accent" : "outline"}
                      onClick={() => {
                        selectFile(entry.fileId);
                        router.push("/dashboard");
                      }}
                    >
                      {entry.fileId === activeFileId ? "الملف مفتوح" : "فتح تحليل الملف"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActionLogHint() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ماذا يحدث بعد التسجيل؟</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-7 text-slate-300">
        الإجراء يُحفظ على هذا الجهاز مع اسم الملف. اضغط «فتح تحليل الملف» لعرض التشخيص لذلك الملف فقط.
      </CardContent>
    </Card>
  );
}
