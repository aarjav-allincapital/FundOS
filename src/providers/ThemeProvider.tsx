"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyColorMode,
  isLocalThemeAvailable,
  readStoredColorMode,
  THEME_STORAGE_KEY,
  type ColorMode,
} from "@/lib/theme";

interface ThemeContextValue {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  themeAvailable: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>("light");
  const [themeAvailable, setThemeAvailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const local = isLocalThemeAvailable();
    setThemeAvailable(local);
    const mode = local ? readStoredColorMode() : "light";
    setColorModeState(mode);
    applyColorMode(mode);
    setHydrated(true);
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    if (!isLocalThemeAvailable()) return;
    setColorModeState(mode);
    applyColorMode(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorMode: hydrated ? colorMode : "light",
      setColorMode,
      themeAvailable: hydrated && themeAvailable,
    }),
    [colorMode, setColorMode, themeAvailable, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
