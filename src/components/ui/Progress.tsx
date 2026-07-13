import { cn } from "@/lib/cn";

/**
 * Progress — a thin deployment/allocation bar. Monochrome by default;
 * pass a tone for semantic emphasis.
 */
export function Progress({
  value,
  max = 100,
  tone = "ink",
  className,
  height = "h-1.5",
}: {
  value: number;
  max?: number;
  tone?: "ink" | "gain" | "loss" | "warn" | "info" | "pending";
  className?: string;
  height?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const toneClass = {
    ink: "bg-ink",
    gain: "bg-gain",
    loss: "bg-loss",
    warn: "bg-warn",
    info: "bg-info",
    pending: "bg-pending",
  }[tone];

  return (
    <div className={cn("w-full rounded-full bg-surface-sunken", height, className)}>
      <div
        className={cn("rounded-full", height, toneClass)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Multi-segment allocation bar (e.g. fund split). */
export function SegmentBar({
  segments,
  height = "h-2",
  className,
}: {
  segments: Array<{ value: number; className: string; label?: string }>;
  height?: string;
  className?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-surface-sunken", height, className)}>
      {segments.map((seg, i) => (
        <div
          key={i}
          className={seg.className}
          style={{ width: `${(seg.value / total) * 100}%` }}
          title={seg.label}
        />
      ))}
    </div>
  );
}
