"use client";

import { useEffect, useRef, useState } from "react";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import { formatNumber } from "@/lib/calc/formatters";
import { cn } from "@/lib/cn";
import { Field, inputClass } from "@/components/forms/form-ui";

export function CashInvestedField({
  currency,
  shares,
  pricePerShare,
}: {
  currency: string;
  shares: number | null | undefined;
  pricePerShare: number | null | undefined;
}) {
  const value = calcCashInvestedLocal(shares, pricePerShare);
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 400);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <Field label={`Cash Invested (${currency})`}>
      <input
        readOnly
        tabIndex={-1}
        aria-live="polite"
        value={formatNumber(value, 2)}
        className={cn(
          inputClass,
          "tnum cursor-default bg-surface-subtle text-ink transition-colors duration-300",
          pulse && "bg-warn/10"
        )}
      />
    </Field>
  );
}
