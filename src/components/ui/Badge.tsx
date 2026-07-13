import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "gain" | "loss" | "warn" | "pending" | "info" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted border-transparent",
  gain: "bg-gain/10 text-gain border-transparent",
  loss: "bg-loss/10 text-loss border-transparent",
  warn: "bg-warn/10 text-warn border-transparent",
  pending: "bg-pending/10 text-pending border-transparent",
  info: "bg-info/10 text-info border-transparent",
  outline: "bg-transparent text-ink-muted border-line-strong",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot = false,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide leading-none",
        TONES[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Map common domain statuses to a tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "active":
    case "signed":
    case "approved":
    case "post_investment":
      return "gain";
    case "written_off":
    case "full_exit":
    case "passed":
    case "write_off":
      return "loss";
    case "pending":
    case "investment_committee":
      return "pending";
    case "draft":
    case "sourcing":
    case "monitoring":
      return "neutral";
    case "partial_exit":
    case "closing":
    case "second_call":
      return "warn";
    default:
      return "neutral";
  }
}
