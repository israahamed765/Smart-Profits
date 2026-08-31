"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MONTHS, t as translate, type Locale, type MessageKey, type Theme } from "@/frontend/lib/i18n";

const THEME_KEY = "smartprofit-theme";
const LOCALE_KEY = "smartprofit-locale";

interface AppearanceValue {
  theme: Theme;
  locale: Locale;
  dir: "rtl" | "ltr";
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey | string) => string;
  months: string[];
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

function applyDom(theme: Theme, locale: Locale) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.lang = locale;
  root.dir = locale === "ar" ? "rtl" : "ltr";
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
      const savedLocale = localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "ar";
      setThemeState(savedTheme);
      setLocaleState(savedLocale);
      applyDom(savedTheme, savedLocale);
    } catch {
      applyDom("dark", "ar");
    }
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      localStorage.setItem(THEME_KEY, next);
      applyDom(next, locale);
    },
    [locale],
  );

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      localStorage.setItem(LOCALE_KEY, next);
      applyDom(theme, next);
    },
    [theme],
  );

  const t = useCallback((key: MessageKey | string) => translate(locale, key), [locale]);
  const dir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";

  const value = useMemo(
    () => ({ theme, locale, dir, setTheme, setLocale, t, months: MONTHS[locale] }),
    [theme, locale, dir, setTheme, setLocale, t],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}
