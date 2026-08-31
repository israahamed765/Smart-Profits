import type { CSSProperties } from "react";
import type { Theme } from "./i18n";

export function chartPalette(theme: Theme) {
  const light = theme === "light";
  return {
    grid: light ? "#cbd5e1" : "#1e293b",
    tick: light ? "#475569" : "#94a3b8",
    tooltipBg: light ? "#ffffff" : "#0f172a",
    tooltipBorder: light ? "#cbd5e1" : "#334155",
    tooltipColor: light ? "#0f172a" : "#e2e8f8",
    revenue: light ? "#0f766e" : "#4fd1c5",
    expenses: light ? "#334155" : "#94a3b8",
    forecast: light ? "#b45309" : "#e8c56b",
  };
}

export function chartTooltipStyle(theme: Theme): CSSProperties {
  const p = chartPalette(theme);
  return {
    background: p.tooltipBg,
    border: `1px solid ${p.tooltipBorder}`,
    borderRadius: 12,
    color: p.tooltipColor,
  };
}
