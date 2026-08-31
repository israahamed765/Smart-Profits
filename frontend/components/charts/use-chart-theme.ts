"use client";

import { useMemo } from "react";
import { useAppearance } from "@/frontend/context/appearance";
import { chartPalette, chartTooltipStyle } from "@/frontend/lib/chart-theme";

export function useChartTheme() {
  const { theme } = useAppearance();
  return useMemo(
    () => ({
      theme,
      ...chartPalette(theme),
      tooltipStyle: chartTooltipStyle(theme),
    }),
    [theme],
  );
}
