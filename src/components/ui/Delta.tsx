import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/calc";

/**
 * Delta — signed change indicator. Green for gains, red for losses,
 * neutral grey for flat. Color is the only chromatic element here.
 */
export function Delta({
  value,
  suffix = "%",
  className,
  showIcon = true,
  decimals = 2,
}: {
  value: number | null | undefined;
  suffix?: string;
  className?: string;
  showIcon?: boolean;
  decimals?: number;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className={cn("text-ink-faint tnum", className)}>—</span>;
  }
  const positive = value > 0.0001;
  const negative = value < -0.0001;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  const text =
    suffix === "%"
      ? formatPercent(value, { decimals, signed: true })
      : `${value > 0 ? "+" : ""}${value.toFixed(decimals)}${suffix}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 tnum font-medium",
        positive && "text-gain",
        negative && "text-loss",
        !positive && !negative && "text-ink-faint",
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3" strokeWidth={2.25} />}
      {text}
    </span>
  );
}
