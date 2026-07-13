import * as React from "react";
import { cn } from "@/lib/cn";
import { Delta } from "@/components/ui/Delta";

/**
 * Metric — a single headline figure. Numbers are the primary visual element,
 * so the value is large, tight and tabular; the label is quiet.
 */
export function Metric({
  label,
  value,
  sublabel,
  delta,
  deltaSuffix,
  align = "left",
  size = "md",
  className,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  delta?: number | null;
  deltaSuffix?: string;
  align?: "left" | "right";
  size?: "sm" | "md" | "lg";
  className?: string;
  hint?: string;
}) {
  const valueSize =
    size === "lg"
      ? "text-2xl"
      : size === "sm"
      ? "text-base"
      : "text-xl";

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "right" && "items-end text-right",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
          {label}
        </span>
      </div>
      <div className={cn("tnum font-semibold text-ink leading-none", valueSize)}>
        {value}
      </div>
      {(sublabel || delta != null) && (
        <div
          className={cn(
            "flex items-center gap-2 text-2xs text-ink-muted",
            align === "right" && "justify-end"
          )}
        >
          {delta != null && <Delta value={delta} suffix={deltaSuffix} />}
          {sublabel && <span className="tnum">{sublabel}</span>}
        </div>
      )}
      {hint && <span className="text-2xs text-ink-faint">{hint}</span>}
    </div>
  );
}
