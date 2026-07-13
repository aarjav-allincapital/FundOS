"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CurrencyCode } from "@/lib/types";

export type FundFilter = "all" | string;

interface DisplayPreferences {
  displayCurrency: CurrencyCode;
  fundFilter: FundFilter;
  setDisplayCurrency: (ccy: CurrencyCode) => void;
  setFundFilter: (filter: FundFilter) => void;
}

const STORAGE_KEY = "fundos_display_prefs_v1";

const DisplayContext = createContext<DisplayPreferences | null>(null);

function loadPrefs(): Pick<DisplayPreferences, "displayCurrency" | "fundFilter"> {
  if (typeof window === "undefined") {
    return { displayCurrency: "USD", fundFilter: "all" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { displayCurrency: "USD", fundFilter: "all" };
    const parsed = JSON.parse(raw) as {
      displayCurrency?: CurrencyCode;
      fundFilter?: FundFilter;
    };
    return {
      displayCurrency: parsed.displayCurrency === "INR" ? "INR" : "USD",
      fundFilter: parsed.fundFilter ?? "all",
    };
  } catch {
    return { displayCurrency: "USD", fundFilter: "all" };
  }
}

export function DisplayPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [displayCurrency, setDisplayCurrencyState] = useState<CurrencyCode>("USD");
  const [fundFilter, setFundFilterState] = useState<FundFilter>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const prefs = loadPrefs();
    setDisplayCurrencyState(prefs.displayCurrency);
    setFundFilterState(prefs.fundFilter);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ displayCurrency, fundFilter })
    );
  }, [displayCurrency, fundFilter, hydrated]);

  const setDisplayCurrency = useCallback((ccy: CurrencyCode) => {
    setDisplayCurrencyState(ccy);
  }, []);

  const setFundFilter = useCallback((filter: FundFilter) => {
    setFundFilterState(filter);
  }, []);

  const value = useMemo<DisplayPreferences>(
    () => ({
      displayCurrency,
      fundFilter,
      setDisplayCurrency,
      setFundFilter,
    }),
    [displayCurrency, fundFilter, setDisplayCurrency, setFundFilter]
  );

  return (
    <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>
  );
}

export function useDisplayPreferences(): DisplayPreferences {
  const ctx = useContext(DisplayContext);
  if (!ctx) {
    throw new Error(
      "useDisplayPreferences must be used within DisplayPreferencesProvider"
    );
  }
  return ctx;
}
