"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const LocaleContext = createContext<{ locale: Locale; toggleLocale: () => void } | null>(null);
const STORAGE_KEY = "kiwitoday-locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (savedLocale === "zh" || savedLocale === "en") setLocale(savedLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en-NZ";
  }, [locale]);

  function toggleLocale() {
    setLocale((current) => {
      const next = current === "zh" ? "en" : "zh";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return <LocaleContext.Provider value={{ locale, toggleLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}