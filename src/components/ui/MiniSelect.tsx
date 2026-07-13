import { cn } from "@/lib/cn";
import { selectLabel } from "@/components/ui/SelectOptions";

export function MiniSelect({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label?: string }[];
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn(
        "h-6 rounded border border-line bg-surface-subtle px-1.5 text-2xs font-medium text-ink-muted outline-none transition-colors hover:border-line-strong focus:border-line-strong",
        className
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label ?? selectLabel(opt.value)}
        </option>
      ))}
    </select>
  );
}
