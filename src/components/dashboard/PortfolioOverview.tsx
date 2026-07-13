"use client";

import { useMemo } from "react";
import type { FundOSData } from "@/lib/types";
import {
  displayPortfolioTotals,
  fundDisplayLabel,
  formatMoney,
  resolveFxRate,
} from "@/lib/calc";
import { Panel } from "@/components/ui/Panel";
import { Metric } from "@/components/ui/Metric";
import { MiniSelect } from "@/components/ui/MiniSelect";
import { cn } from "@/lib/cn";
import { useDisplayPreferences } from "@/providers/DisplayPreferencesProvider";

export function PortfolioOverview({ data }: { data: FundOSData }) {
  const { displayCurrency, fundFilter, setDisplayCurrency, setFundFilter } =
    useDisplayPreferences();

  const fxAsOf = new Date().toISOString().slice(0, 10);
  const fundId = fundFilter === "all" ? undefined : fundFilter;
  const totals = displayPortfolioTotals(data, displayCurrency, fxAsOf, {
    fundId,
  });

  const fxHint = useMemo(() => {
    const funds = fundId
      ? data.funds.filter((f) => f.id === fundId)
      : data.funds;
    const nativeCurrencies = new Set(funds.map((f) => f.currency));
    if (nativeCurrencies.size <= 1 && nativeCurrencies.has(displayCurrency)) {
      return null;
    }
    if (displayCurrency === "INR") {
      const usdInr = resolveFxRate(data.fxRates, "USD", "INR", fxAsOf, {
        purposes: ["reporting", "manual", "transaction"],
      });
      if (usdInr.rate > 1) {
        return `1 USD = ₹${usdInr.rate.toFixed(2)}`;
      }
    }
    if (displayCurrency === "USD") {
      const inrUsd = resolveFxRate(data.fxRates, "INR", "USD", fxAsOf, {
        purposes: ["reporting", "manual", "transaction"],
      });
      if (inrUsd.rate > 0 && inrUsd.rate < 1) {
        return `1 INR = $${inrUsd.rate.toFixed(4)}`;
      }
    }
    return null;
  }, [data.fxRates, displayCurrency, fundId, data.funds, fxAsOf]);

  const fundOptions = [
    { value: "all", label: "All Funds" },
    ...data.funds.map((f) => ({
      value: f.id,
      label: fundDisplayLabel(f.vehicle_code, f.name),
    })),
  ];

  return (
    <Panel>
      <div className="flex items-center justify-end gap-2 border-b border-line px-3 py-2">
        <MiniSelect
          aria-label="Filter by fund"
          value={fundFilter}
          onChange={setFundFilter}
          options={fundOptions}
        />
        <MiniSelect
          aria-label="Display currency"
          value={displayCurrency}
          onChange={(v) => setDisplayCurrency(v as "USD" | "INR")}
          options={[
            { value: "USD", label: "USD" },
            { value: "INR", label: "INR" },
          ]}
        />
        {fxHint && (
          <span className="text-2xs text-ink-faint">{fxHint}</span>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5">
        <Cell className="border-b border-r border-line lg:border-b-0">
          <Metric
            label="Current NAV"
            value={
              <span className="tnum">
                {formatMoney(totals.nav, displayCurrency, { compact: true })}
              </span>
            }
            sublabel="Unrealized, mark-to-market"
          />
        </Cell>
        <Cell className="border-b border-line lg:border-b-0 lg:border-r">
          <Metric
            label="Capital Deployed"
            value={
              <span className="tnum">
                {formatMoney(totals.deployed, displayCurrency, { compact: true })}
              </span>
            }
            sublabel="Cost basis at entry"
          />
        </Cell>
        <Cell className="border-b border-r border-line lg:border-b-0">
          <Metric
            label="Unrealized Gain"
            value={
              <span className="tnum">
                {formatMoney(totals.unrealized, displayCurrency, {
                  compact: true,
                  signed: true,
                })}
              </span>
            }
            sublabel="NAV less cost"
          />
        </Cell>
        <Cell className="border-b border-line lg:border-b-0 lg:border-r">
          <Metric
            label="Blended MOIC"
            value={
              <span className="tnum">
                {totals.moic > 0 ? `${totals.moic.toFixed(2)}x` : "—"}
              </span>
            }
            sublabel="NAV / deployed"
          />
        </Cell>
        <Cell className="border-line lg:border-r-0">
          <Metric
            label="Portfolio"
            value={
              <span className="tnum">
                {totals.companyCount}
                <span className="text-ink-faint text-sm font-normal"> cos</span>
              </span>
            }
            sublabel={`${totals.activeLotCount} active lots`}
          />
        </Cell>
      </div>
    </Panel>
  );
}

function Cell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
