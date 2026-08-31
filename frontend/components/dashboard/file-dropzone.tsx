"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { CloudUpload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OpexSetupModal } from "@/frontend/components/opex/opex-setup-modal";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useSmartGuard } from "@/frontend/context/smart-guard-context";
import { GuardBlockedError } from "@/frontend/lib/smart-guard/client";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/frontend/ui/cn";

export function FileDropzone({
  compact = false,
  title,
  hint,
}: {
  compact?: boolean;
  title?: string;
  hint?: string;
  redirectToAnalysis?: boolean;
}) {
  const { analyzeFile, isProcessing, saveSettings } = useAnalysis();
  const { protect, pending } = useSmartGuard();
  const { t } = useAppearance();
  const router = useRouter();
  const [setupOpen, setSetupOpen] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const pendingFiles = useRef<File[] | null>(null);
  const analyzeAfterPicker = useRef(false);

  const runAnalysis = useCallback(
    async (files: File[]) => {
      const selected = files.filter(Boolean);
      if (!selected.length) return;
      try {
        for (const file of selected) {
          await analyzeFile(file);
        }
        toast.success(selected.length > 1 ? t("data.analyzedMany") : t("data.analyzedOne"));
        router.replace("/data");
      } catch (error) {
        if (error instanceof GuardBlockedError) return;
        toast.error(error instanceof Error ? error.message : t("data.analyzeFail"));
      }
    },
    [analyzeFile, router, t],
  );

  const onDrop = useCallback(
    async (files: File[]) => {
      const selected = files.filter(Boolean);
      if (!selected.length) return;
      try {
        await protect("file_upload", { file: selected[0] });
      } catch (error) {
        if (error instanceof GuardBlockedError) return;
        toast.error(error instanceof Error ? error.message : t("data.analyzeFail"));
        return;
      }
      if (analyzeAfterPicker.current) {
        analyzeAfterPicker.current = false;
        await runAnalysis(selected);
        return;
      }
      pendingFiles.current = selected;
      setHasPending(true);
      setSetupOpen(true);
    },
    [protect, runAnalysis],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: true,
    maxSize: 50 * 1024 * 1024,
    disabled: isProcessing || pending,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
  });

  async function handleZoneClick() {
    if (isProcessing || pending) return;
    try {
      await protect("file_upload");
    } catch (error) {
      if (error instanceof GuardBlockedError) return;
    }
    pendingFiles.current = null;
    setHasPending(false);
    setSetupOpen(true);
  }

  function handleConfirm(next: AppSettings) {
    saveSettings(next);
    setSetupOpen(false);
    const held = pendingFiles.current;
    pendingFiles.current = null;
    setHasPending(false);
    if (held?.length) {
      void runAnalysis(held);
      return;
    }
    analyzeAfterPicker.current = true;
    window.setTimeout(() => open(), 60);
  }

  function handleConfirmSkip() {
    setSetupOpen(false);
    const held = pendingFiles.current;
    pendingFiles.current = null;
    setHasPending(false);
    if (held?.length) {
      void runAnalysis(held);
      return;
    }
    analyzeAfterPicker.current = true;
    window.setTimeout(() => open(), 60);
  }

  function handleClose() {
    pendingFiles.current = null;
    setHasPending(false);
    analyzeAfterPicker.current = false;
    setSetupOpen(false);
  }

  const rootProps = getRootProps();

  return (
    <>
      <div
        {...rootProps}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleZoneClick();
        }}
        className={cn(
          "cursor-pointer rounded-2xl border-2 border-dashed transition",
          isDragActive ? "border-primary bg-primary/10" : "border-border bg-card/50 hover:border-primary/60",
          compact ? "p-4 sm:p-6" : "p-6 sm:p-10",
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            {isProcessing ? <Loader2 className="h-7 w-7 animate-spin" /> : <CloudUpload className="h-7 w-7" />}
          </div>
          <p className="text-base font-medium text-foreground">
            {title ?? (isProcessing ? t("data.studying") : t("data.drop"))}
          </p>
          <p className="mt-1 text-sm text-muted">{hint ?? t("data.orClick")}</p>
          <p className="mt-2 max-w-md text-xs leading-6 text-amber-700 dark:text-amber-200/80">
            {t("data.guardHint")}
          </p>
          <p className="mt-2 max-w-md text-xs leading-6 text-amber-700 dark:text-amber-200/80">
            {t("data.opexHint")}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {t("data.formats")}
          </div>
        </div>
      </div>
      <OpexSetupModal
        open={setupOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        onSkip={handleConfirmSkip}
        confirmLabel={hasPending ? t("opex.confirmAnalyze") : t("opex.confirmUpload")}
        skipLabel={t("opex.skipUpload")}
      />
    </>
  );
}
