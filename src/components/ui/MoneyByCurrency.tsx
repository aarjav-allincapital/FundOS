import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/calc";

/**
 * Renders a set of per-currency amounts. Because funds report in different
 * currencies (USD/INR), totals are never summed across currencies — they are
 * shown side by side. This keeps the numbers honest.
 */
export function MoneyByCurrency({
  amounts,
  compact = true,
  signed = false,
  className,
  emptyLabel = "—",
}: {
  amounts: Record<string, number>;
  compact?: boolean;
  signed?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const entries = Object.entries(amounts).filter(([, v]) => v !== 0 || Object.keys(amounts).length === 1);
  if (entries.length === 0) {
    return <span className={cn("text-ink-faint tnum", className)}>{emptyLabel}</span>;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tnum", className)}>
      {entries.map(([ccy, val], i) => (
        <span key={ccy} className="whitespace-nowrap">
          {formatMoney(val, ccy, { compact, signed })}
          {i < entries.length - 1 && (
            <span className="ml-2 text-ink-faint">·</span>
          )}
        </span>
      ))}
    </span>
  );
}
