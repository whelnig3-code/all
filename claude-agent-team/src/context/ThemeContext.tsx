"use client";

/**
 * ThemeContext — 다크/라이트 테마 상태 관리
 *
 * 비유: 건물의 조명 스위치 시스템.
 * - localStorage에 선호 조명(테마) 저장
 * - data-theme 속성을 바꿔 CSS 변수 값을 일괄 전환
 * - highlight.js 테마도 동기화
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  readonly theme: Theme;
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "jm-theme";
const HL_DARK  = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
const HL_LIGHT = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // data-theme 속성 + localStorage 동기화
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);

    // highlight.js 테마 전환
    const hlLink = document.getElementById("hljs-theme") as HTMLLinkElement | null;
    if (hlLink) {
      hlLink.href = theme === "light" ? HL_LIGHT : HL_DARK;
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
